import type { RollResult } from '@rpg/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type RollVisibility = 'public' | 'gm' | 'self_gm';

export interface RollRow {
  id: string;
  campaign_id: string;
  user_id: string | null;
  character_id: string | null;
  label: string;
  expression: string;
  result: RollResult;
  total: number;
  visibility: RollVisibility;
  created_at: string;
  author?: { display_name: string } | null;
}

export interface RollRequest {
  campaign_id: string;
  character_id?: string;
  roll_id?: string;
  item_key?: string;
  expression?: string;
  label?: string;
  dados?: number;
  bonus?: number;
  visibility?: RollVisibility;
}

export const rollKeys = { list: (campaignId: string) => ['rolls', campaignId] as const };

export function useRolls(campaignId: string, limit = 50) {
  return useQuery({
    queryKey: [...rollKeys.list(campaignId), limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rolls')
        .select('id, campaign_id, user_id, character_id, label, expression, result, total, visibility, created_at, author:profiles(display_name)')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as unknown as RollRow[];
    },
  });
}

/** Rola no servidor (Edge Function "roll"). A rolagem aparece no histórico de todos na hora. */
export function useRollMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: RollRequest): Promise<RollRow> => {
      const { data, error } = await supabase.functions.invoke('roll', { body: req });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
        throw new Error(body?.error ?? error.message);
      }
      return data as RollRow;
    },
    onSuccess: (row) => void qc.invalidateQueries({ queryKey: rollKeys.list(row.campaign_id) }),
  });
}
