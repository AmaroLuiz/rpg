import { loadTemplate, Sheet, type CompiledTemplate } from '@rpg/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Json } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import type { CharacterRow } from './characters';

export interface Combatant {
  id: string;
  encounter_id: string;
  character_id: string | null;
  label: string;
  initiative: number | null;
  order_index: number;
  conditions: string[];
  public_status: 'ileso' | 'ferido' | 'muito_ferido' | 'caido' | null;
  hidden: boolean;
  /** Só o mestre recebe (RLS); para jogadores vem nulo. */
  secret: { resources: Record<string, { atual: number; max: number }> } | null;
  character: { kind: 'pc' | 'npc' | 'monster'; owner_id: string; template_version_id: string } | null;
}

export interface Encounter {
  id: string;
  campaign_id: string;
  name: string;
  status: 'prep' | 'active' | 'ended';
  round: number;
  turn_index: number;
  current_combatant_id: string | null;
  created_at: string;
  combatants: Combatant[];
}

const key = (campaignId: string) => ['combat', campaignId] as const;

/** Combate atual da mesa (o mais recente que não terminou). */
export function useCurrentEncounter(campaignId: string) {
  return useQuery({
    queryKey: key(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('encounters')
        .select(
          'id, campaign_id, name, status, round, turn_index, current_combatant_id, created_at, combatants!combatants_encounter_id_fkey(id, encounter_id, character_id, label, initiative, order_index, conditions, public_status, hidden, secret:combatant_secrets(resources), character:characters(kind, owner_id, template_version_id))',
        )
        .eq('campaign_id', campaignId)
        .neq('status', 'ended')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const enc = data as unknown as Encounter;
      enc.combatants.sort((a, b) => a.order_index - b.order_index || a.label.localeCompare(b.label));
      return enc;
    },
  });
}

function useCombatMutation<V>(campaignId: string, fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: key(campaignId) }) });
}

async function check<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

/** Dano/cura em inimigo: aparece na hora (otimista) e o servidor soma de forma atômica. */
function useAdjustResource(campaignId: string) {
  const qc = useQueryClient();
  const k = key(campaignId);
  return useMutation({
    mutationFn: (v: { id: string; resource: string; delta: number }) =>
      check(supabase.rpc('adjust_combatant_resource', { p_combatant: v.id, p_resource: v.resource, p_delta: v.delta })),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: k });
      qc.setQueryData<Encounter | null>(k, (enc) =>
        enc
          ? {
              ...enc,
              combatants: enc.combatants.map((c) => {
                const r = c.secret?.resources?.[v.resource];
                if (c.id !== v.id || !r) return c;
                return { ...c, secret: { resources: { ...c.secret!.resources, [v.resource]: { ...r, atual: r.atual + v.delta } } } };
              }),
            }
          : enc,
      );
    },
    onSettled: () => {
      // Só relê quando não há outros toques a caminho, para a barra não pular para trás.
      if (qc.isMutating({ mutationKey: ['adjust', campaignId] }) <= 1) void qc.invalidateQueries({ queryKey: k });
    },
    mutationKey: ['adjust', campaignId],
  });
}

export function useCombatActions(campaignId: string) {
  return {
    adjust: useAdjustResource(campaignId),
    create: useCombatMutation(campaignId, (name: string) =>
      check(supabase.from('encounters').insert({ campaign_id: campaignId, name }).select('id').single()),
    ),
    end: useCombatMutation(campaignId, (id: string) => check(supabase.from('encounters').update({ status: 'ended' }).eq('id', id))),
    add: useCombatMutation(
      campaignId,
      (v: { encounterId: string; characterId: string; count: number; resources: Record<string, unknown>; hidden?: boolean }) =>
        check(
          supabase.rpc('add_combatants', {
            p_encounter: v.encounterId,
            p_character: v.characterId,
            p_count: v.count,
            p_resources: v.resources as Json,
            p_hidden: v.hidden ?? false,
          }),
        ),
    ),
    remove: useCombatMutation(campaignId, (id: string) => check(supabase.from('combatants').delete().eq('id', id))),
    setInitiative: useCombatMutation(campaignId, (v: { id: string; value: number | null }) =>
      check(supabase.from('combatants').update({ initiative: v.value }).eq('id', v.id)),
    ),
    sort: useCombatMutation(campaignId, (encounterId: string) => check(supabase.rpc('sort_initiative', { p_encounter: encounterId }))),
    turn: useCombatMutation(campaignId, (v: { encounterId: string; step: 1 | -1 }) =>
      check(supabase.rpc('advance_turn', { p_encounter: v.encounterId, p_step: v.step })),
    ),
    setHidden: useCombatMutation(campaignId, (v: { id: string; hidden: boolean }) => check(supabase.from('combatants').update({ hidden: v.hidden }).eq('id', v.id))),
    setConditions: useCombatMutation(campaignId, (v: { id: string; conditions: string[] }) =>
      check(supabase.from('combatants').update({ conditions: v.conditions }).eq('id', v.id)),
    ),
    setResources: useCombatMutation(campaignId, (v: { id: string; resources: Record<string, { atual: number; max: number }> }) =>
      check(supabase.from('combatant_secrets').update({ resources: v.resources as unknown as NonNullable<Json> }).eq('combatant_id', v.id)),
    ),
  };
}

const templates = new Map<string, CompiledTemplate>();

export async function getTemplate(versionId: string): Promise<CompiledTemplate> {
  let tpl = templates.get(versionId);
  if (!tpl) {
    const v = (await check(supabase.from('template_versions').select('schema').eq('id', versionId).single()))!;
    tpl = loadTemplate(v.schema);
    templates.set(versionId, tpl);
  }
  return tpl;
}

/** Rola a iniciativa do combatente pela ficha dele (no servidor) e grava o total. */
export async function rollInitiative(campaignId: string, c: Combatant): Promise<number | null> {
  if (!c.character_id || !c.character) return null;
  const tpl = await getTemplate(c.character.template_version_id);
  if (!tpl.template.initiative) return null;
  const { data, error } = await supabase.functions.invoke('roll', {
    body: {
      campaign_id: campaignId,
      character_id: c.character_id,
      roll_id: tpl.template.initiative,
      label: c.label,
      // Iniciativa de inimigo é rolada em segredo; a dos personagens, à vista.
      visibility: c.character.kind === 'pc' ? 'public' : 'gm',
    },
  });
  if (error) throw error;
  const total = (data as { total: number }).total;
  await check(supabase.from('combatants').update({ initiative: total }).eq('id', c.id));
  return total;
}

/** Recursos iniciais (cheios) de um NPC/monstro, calculados pela ficha dele. */
export async function initialResources(characterId: string): Promise<Record<string, { atual: number; max: number }>> {
  const ch = (await check(supabase.from('characters').select('data, template_version_id').eq('id', characterId).single()))!;
  const tpl = await getTemplate(ch.template_version_id);
  const sheet = new Sheet(tpl, ch.data as unknown as CharacterRow['data']);
  const out: Record<string, { atual: number; max: number }> = {};
  for (const f of tpl.template.fields) {
    if (f.type !== 'resource') continue;
    const r = sheet.resource(f.id);
    if (!r.error) out[f.id] = { atual: r.max, max: r.max };
  }
  return out;
}

/** NPCs e monstros da biblioteca do mestre. */
export function useLibrary(campaignId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['library', campaignId],
    enabled,
    queryFn: async () =>
      check(
        supabase
          .from('characters')
          .select('id, name, nome:data->values->>nome, kind, portrait_path')
          .eq('campaign_id', campaignId)
          .eq('is_library', true)
          .order('name'),
      ) as Promise<Array<{ id: string; name: string; nome: string | null; kind: CharacterRow['kind']; portrait_path: string | null }>>,
  });
}
