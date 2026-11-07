import {
  applyOps,
  loadTemplate,
  newCharacterData,
  type CharacterData,
  type CompiledTemplate,
  type InventoryItem,
  type Modifier,
} from '@rpg/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Json } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { localDb } from '../sync/local';
import { isTransient, onBatchApplied, onBatchRejected, queryClient, usePendingOps } from '../sync';

export interface CharacterRow {
  id: string;
  campaign_id: string;
  owner_id: string;
  kind: 'pc' | 'npc' | 'monster';
  name: string;
  data: CharacterData;
  version: number;
  status: 'draft' | 'active' | 'archived';
  visibility: 'public' | 'gm';
  is_library: boolean;
  template_version_id: string;
  portrait_path: string | null;
  updated_at: string;
}

export interface CharacterListItem {
  id: string;
  name: string;
  nome: string | null;
  kind: CharacterRow['kind'];
  owner_id: string;
  visibility: CharacterRow['visibility'];
  status: CharacterRow['status'];
  portrait_path: string | null;
  owner: { display_name: string } | null;
}

export const characterKeys = {
  list: (campaignId: string) => ['characters', campaignId] as const,
  one: (id: string) => ['character', id] as const,
  items: (id: string) => ['character-items', id] as const,
  template: (versionId: string) => ['template-version', versionId] as const,
  campaignTemplate: (campaignId: string) => ['campaign-template', campaignId] as const,
};

const COLUMNS =
  'id, campaign_id, owner_id, kind, name, data, version, status, visibility, is_library, template_version_id, portrait_path, updated_at';

/** Lê do servidor; sem rede, usa a última cópia guardada no aparelho. */
async function fetchCharacter(id: string): Promise<CharacterRow | null> {
  try {
    const { data, error } = await supabase.from('characters').select(COLUMNS).eq('id', id).maybeSingle();
    if (error) throw error;
    if (data) await localDb.characters.put(data as unknown as CharacterRow & Record<string, unknown>);
    else await localDb.characters.delete(id);
    return data as unknown as CharacterRow | null;
  } catch (e) {
    if (!isTransient(e)) throw e;
    const cached = await localDb.characters.get(id);
    if (cached) return cached as unknown as CharacterRow;
    throw e;
  }
}

/**
 * Aceita uma linha vinda do servidor só se for mais nova que a do cache.
 * Assim um evento atrasado do tempo real nunca desfaz uma versão já vista.
 */
export function acceptServerRow(row: CharacterRow) {
  queryClient.setQueryData<CharacterRow | null>(characterKeys.one(row.id), (prev) => {
    if (prev && prev.version > row.version) return prev;
    // Mesma versão = mesmos dados; só aceita se for metadado mais novo (retrato, status, nome).
    if (prev && prev.version === row.version && row.updated_at <= prev.updated_at) return prev;
    void localDb.characters.put(row as unknown as CharacterRow & Record<string, unknown>);
    return row;
  });
}

// Lote confirmado: se o cache estava exatamente na versão anterior, aplica as operações
// localmente (sem esperar o tempo real). Senão, outra pessoa mexeu no meio: relê do servidor.
onBatchApplied((batch, result) => {
  const key = characterKeys.one(batch.characterId);
  const row = queryClient.getQueryData<CharacterRow | null>(key);
  if (!row) return;
  if (row.version >= result.version) return;
  if (!result.duplicate && row.version === result.version - 1) {
    acceptServerRow({ ...row, data: applyOps(row.data, batch.ops), version: result.version });
  } else {
    void queryClient.invalidateQueries({ queryKey: key });
  }
});
onBatchRejected((batch) => void queryClient.invalidateQueries({ queryKey: characterKeys.one(batch.characterId) }));

export function useCharacter(id: string) {
  return useQuery({ queryKey: characterKeys.one(id), queryFn: () => fetchCharacter(id) });
}

export function useCharacters(campaignId: string) {
  return useQuery({
    queryKey: characterKeys.list(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, nome:data->values->>nome, kind, owner_id, visibility, status, portrait_path, owner:profiles(display_name)')
        .eq('campaign_id', campaignId)
        .eq('is_library', false)
        .order('created_at');
      if (error) throw error;
      return data as unknown as CharacterListItem[];
    },
  });
}

const compiledCache = new Map<string, CompiledTemplate>();

async function fetchTemplateSchema(versionId: string): Promise<unknown> {
  try {
    const { data, error } = await supabase.from('template_versions').select('id, schema').eq('id', versionId).single();
    if (error) throw error;
    await localDb.templates.put({ id: versionId, schema: data.schema });
    return data.schema;
  } catch (e) {
    const cached = await localDb.templates.get(versionId);
    if (cached) return cached.schema;
    throw e;
  }
}

function compile(versionId: string, schema: unknown): CompiledTemplate {
  let c = compiledCache.get(versionId);
  if (!c) {
    c = loadTemplate(schema);
    compiledCache.set(versionId, c);
  }
  return c;
}

/** Template de uma versão específica, já validado. Versões publicadas nunca mudam. */
export function useTemplateVersion(versionId: string | undefined) {
  return useQuery({
    queryKey: characterKeys.template(versionId ?? ''),
    enabled: !!versionId,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => compile(versionId!, await fetchTemplateSchema(versionId!)),
  });
}

/** Versão atual do template da mesa (para fichas novas). */
async function campaignTemplate(campaignId: string): Promise<{ versionId: string; compiled: CompiledTemplate }> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('template:templates(current_version, versions:template_versions(id, version, schema))')
    .eq('id', campaignId)
    .single();
  if (error) throw error;
  const tpl = (data as unknown as { template: { current_version: number; versions: Array<{ id: string; version: number; schema: unknown }> } }).template;
  const v = tpl.versions.find((x) => x.version === tpl.current_version);
  if (!v) throw new Error('Template da mesa sem versão publicada');
  await localDb.templates.put({ id: v.id, schema: v.schema });
  return { versionId: v.id, compiled: compile(v.id, v.schema) };
}

export function useCreateCharacter(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { name: string; kind?: CharacterRow['kind']; visibility?: CharacterRow['visibility']; library?: boolean }) => {
      const { compiled } = await campaignTemplate(campaignId);
      const data = newCharacterData(compiled);
      if (compiled.fields.has('nome')) data.values.nome = v.name;
      const { data: row, error } = await supabase.rpc('create_character', {
        p_campaign: campaignId,
        p_name: v.name,
        p_data: data as unknown as Json,
        p_kind: v.kind ?? 'pc',
        p_visibility: v.visibility ?? 'public',
        p_is_library: v.library ?? false,
      });
      if (error) throw error;
      // Fichas da biblioteca não passam pelo assistente: já nascem prontas.
      if (v.library) {
        const { data: active, error: e2 } = await supabase.from('characters').update({ status: 'active' }).eq('id', (row as { id: string }).id).select(COLUMNS).single();
        if (e2) throw e2;
        return active as unknown as CharacterRow;
      }
      return row as unknown as CharacterRow;
    },
    onSuccess: (row) => {
      acceptServerRow(row);
      void qc.invalidateQueries({ queryKey: characterKeys.list(campaignId) });
      void qc.invalidateQueries({ queryKey: ['library', campaignId] });
    },
  });
}

export function useDeleteCharacter(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('characters').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data.length) throw new Error('Sem permissão para apagar este personagem.');
      await localDb.characters.delete(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: characterKeys.list(campaignId) }),
  });
}

/** Muda status, retrato ou nome (colunas fora de `data`, que não passam pela fila). */
export function useUpdateCharacterMeta(id: string) {
  return useMutation({
    mutationFn: async (patch: Partial<Pick<CharacterRow, 'status' | 'portrait_path' | 'name'>>) => {
      const { data, error } = await supabase.from('characters').update(patch).eq('id', id).select(COLUMNS).single();
      if (error) throw error;
      return data as unknown as CharacterRow;
    },
    onSuccess: (row) => acceptServerRow(row),
  });
}

/** Itens do personagem no formato do motor (os equipados aplicam modificadores). */
export function useCharacterItems(characterId: string) {
  return useQuery({
    queryKey: characterKeys.items(characterId),
    queryFn: async (): Promise<InventoryItem[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, quantity, equipped, data, modifiers')
        .eq('holder_type', 'character')
        .eq('holder_id', characterId)
        .order('sort');
      if (error) throw error;
      return data.map((it) => ({
        id: it.id,
        nome: it.name,
        quantidade: Number(it.quantity),
        equipado: it.equipped,
        data: (it.data ?? {}) as InventoryItem['data'],
        modifiers: (it.modifiers ?? []) as unknown as Modifier[],
      }));
    },
  });
}

/** Dados que a ficha mostra: confirmados pelo servidor + mudanças ainda na fila. */
export function useCharacterData(row: CharacterRow | null | undefined): CharacterData | null {
  const pending = usePendingOps(row?.id);
  return useMemo(() => (row ? (pending.length ? applyOps(row.data, pending) : row.data) : null), [row, pending]);
}
