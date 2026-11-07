import type { Modifier } from '@rpg/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Json } from '../lib/database.types';

type J = NonNullable<Json>;
import { supabase } from '../lib/supabase';

export type HolderType = 'character' | 'loot' | 'library' | 'party';

export interface ItemRow {
  id: string;
  campaign_id: string;
  holder_type: HolderType;
  holder_id: string | null;
  name: string;
  description: string;
  quantity: number;
  equipped: boolean;
  data: Record<string, string | number | boolean | null>;
  modifiers: Modifier[];
  identified: boolean;
  sort: number;
}

export interface ItemSecret {
  real_name: string;
  real_description: string;
  real_modifiers: Modifier[];
}

export interface LootPool {
  id: string;
  campaign_id: string;
  name: string;
  mode: 'distribute' | 'free_pick';
  revealed: boolean;
  created_at: string;
}

const COLS = 'id, campaign_id, holder_type, holder_id, name, description, quantity, equipped, data, modifiers, identified, sort';

async function check<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export const itemKeys = {
  all: ['items'] as const,
  holder: (campaignId: string, type: HolderType, id?: string | null) => ['items', campaignId, type, id ?? null] as const,
  loot: (campaignId: string) => ['loot', campaignId] as const,
};

export function useItems(campaignId: string, type: HolderType, holderId?: string | null, enabled = true) {
  return useQuery({
    queryKey: itemKeys.holder(campaignId, type, holderId),
    enabled,
    queryFn: async () => {
      let q = supabase.from('items').select(COLS).eq('campaign_id', campaignId).eq('holder_type', type);
      if (holderId) q = q.eq('holder_id', holderId);
      const rows = (await check(q.order('sort').order('name')))!;
      return rows.map((r) => ({ ...r, quantity: Number(r.quantity) })) as unknown as ItemRow[];
    },
  });
}

function useInvalidateItems() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: itemKeys.all });
    void qc.invalidateQueries({ queryKey: ['character-items'] });
  };
}

export type ItemDraft = Pick<ItemRow, 'name' | 'description' | 'quantity' | 'data' | 'modifiers'> & {
  id?: string;
  equipped?: boolean;
  identified?: boolean;
  secret?: ItemSecret | null;
};

export function useSaveItem(campaignId: string) {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: async (v: ItemDraft & { holder_type?: HolderType; holder_id?: string | null }) => {
      const base = {
        name: v.name,
        description: v.description,
        quantity: v.quantity,
        data: v.data as unknown as J,
        modifiers: v.modifiers as unknown as J,
        ...(v.equipped !== undefined ? { equipped: v.equipped } : {}),
        ...(v.identified !== undefined ? { identified: v.identified } : {}),
      };
      const row = (v.id
        ? await check(supabase.from('items').update(base).eq('id', v.id).select('id').single())
        : await check(
            supabase
              .from('items')
              .insert({ ...base, campaign_id: campaignId, holder_type: v.holder_type!, holder_id: v.holder_id ?? null })
              .select('id')
              .single(),
          ))!;
      // Segredo do item misterioso (só o mestre chega aqui com secret).
      if (v.secret) {
        await check(
          supabase.from('item_secrets').upsert({
            item_id: row.id,
            campaign_id: campaignId,
            real_name: v.secret.real_name,
            real_description: v.secret.real_description,
            real_modifiers: v.secret.real_modifiers as unknown as J,
          }),
        );
      } else if (v.secret === null && v.id) {
        await check(supabase.from('item_secrets').delete().eq('item_id', v.id));
      }
      return row.id;
    },
    onSuccess: invalidate,
  });
}

export function useSetEquipped() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (v: { id: string; equipped: boolean }) => check(supabase.from('items').update({ equipped: v.equipped }).eq('id', v.id)),
    onSuccess: invalidate,
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateItems();
  return useMutation({ mutationFn: (id: string) => check(supabase.from('items').delete().eq('id', id)), onSuccess: invalidate });
}

export function useItemSecret(itemId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['item-secret', itemId],
    enabled: enabled && !!itemId,
    queryFn: async () =>
      (await check(supabase.from('item_secrets').select('real_name, real_description, real_modifiers').eq('item_id', itemId!).maybeSingle())) as unknown as ItemSecret | null,
  });
}

export function useItemActions() {
  const invalidate = useInvalidateItems();
  const qc = useQueryClient();
  return {
    copy: useMutation({
      mutationFn: (v: { id: string; to: HolderType; holderId?: string | null; quantity?: number }) =>
        check(supabase.rpc('copy_item', { p_item: v.id, p_holder_type: v.to, ...(v.holderId ? { p_holder_id: v.holderId } : {}), ...(v.quantity ? { p_quantity: v.quantity } : {}) })),
      onSuccess: invalidate,
    }),
    take: useMutation({
      mutationFn: (v: { id: string; characterId: string }) => check(supabase.rpc('take_loot_item', { p_item: v.id, p_character: v.characterId })),
      onSuccess: invalidate,
    }),
    identify: useMutation({
      mutationFn: (id: string) => check(supabase.rpc('identify_item', { p_item: id })),
      onSuccess: () => {
        invalidate();
        void qc.invalidateQueries({ queryKey: ['item-secret'] });
      },
    }),
  };
}

export function useLootPools(campaignId: string) {
  return useQuery({
    queryKey: itemKeys.loot(campaignId),
    queryFn: async () =>
      (await check(supabase.from('loot_pools').select('id, campaign_id, name, mode, revealed, created_at').eq('campaign_id', campaignId).order('created_at'))) as LootPool[],
  });
}

export function usePoolActions(campaignId: string) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: itemKeys.loot(campaignId) });
    void qc.invalidateQueries({ queryKey: itemKeys.all });
  };
  return {
    create: useMutation({
      mutationFn: (v: { name: string; mode: LootPool['mode'] }) => check(supabase.from('loot_pools').insert({ campaign_id: campaignId, ...v }).select('id').single()),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: (v: { id: string } & Partial<Pick<LootPool, 'name' | 'mode' | 'revealed'>>) => {
        const { id, ...patch } = v;
        return check(supabase.from('loot_pools').update(patch).eq('id', id));
      },
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: string) => check(supabase.from('loot_pools').delete().eq('id', id)), onSuccess: done }),
  };
}
