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
  offline?: boolean;
  created_at: string;
  author?: { display_name: string } | null;
  /** Só no app: rolagem feita sem internet, ainda não enviada. */
  pending?: boolean;
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
        .select('id, campaign_id, user_id, character_id, label, expression, result, total, visibility, offline, created_at, author:profiles(display_name)')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as unknown as RollRow[];
    },
  });
}

/** Cálculo local da mesma rolagem, para quando não há internet. */
export type LocalRoll = (o: { dados: number; bonus: number }) => RollResult;

function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const e = error as { name?: string; context?: Response; message?: string };
  if (e.name === 'FunctionsFetchError' || e.name === 'FunctionsRelayError') return true;
  if (e.context && typeof e.context.status === 'number') return e.context.status >= 500;
  return /fetch|network/i.test(e.message ?? '');
}

/**
 * Rola no servidor (Edge Function "roll"); a rolagem aparece no histórico de todos na hora.
 * Sem internet e com `local`, rola no aparelho e guarda para enviar depois (marcada offline).
 */
export function useRollMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ req, local }: { req: RollRequest; local?: LocalRoll }): Promise<RollRow> => {
      const { data, error } = await supabase.functions.invoke('roll', { body: req });
      if (!error) return data as RollRow;
      if (local && isNetworkFailure(error)) {
        const { queueOfflineRoll } = await import('../roller/offlineRolls');
        const result = local({ dados: req.dados ?? 0, bonus: req.bonus ?? 0 });
        const q = await queueOfflineRoll(req, result);
        return {
          id: q.id,
          campaign_id: req.campaign_id,
          user_id: null,
          character_id: req.character_id ?? null,
          label: result.label,
          expression: result.expression,
          result,
          total: result.total,
          visibility: req.visibility ?? 'public',
          offline: true,
          pending: true,
          created_at: new Date(q.createdAt).toISOString(),
        };
      }
      const ctx = (error as { context?: Response }).context;
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
      throw new Error(body?.error ?? (isNetworkFailure(error) ? 'Sem conexão: não deu para rolar.' : error.message));
    },
    onSuccess: (row) => {
      if (!row.pending) void qc.invalidateQueries({ queryKey: rollKeys.list(row.campaign_id) });
    },
  });
}
