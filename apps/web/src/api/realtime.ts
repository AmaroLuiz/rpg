import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { announceRoll } from '../roller/RollToasts';
import { acceptServerRow, characterKeys, type CharacterRow } from './characters';
import type { RollRow } from './rolls';

/**
 * Um canal Realtime por mesa, compartilhado por todas as telas dela.
 * - Mudanças no banco (filtradas por campaign_id, já com RLS) invalidam as consultas da mesa.
 * - Presence mostra quem está com a mesa aberta.
 * O canal é fechado com atraso: o React (modo estrito) e a troca rápida de telas
 * desmontam e remontam na hora, e fechar/reabrir o mesmo tópico derruba a assinatura.
 */

interface Entry {
  channel: RealtimeChannel;
  refs: number;
  closeTimer?: ReturnType<typeof setTimeout>;
  online: Set<string>;
  listeners: Set<() => void>;
}

const registry = new Map<string, Entry>();
const EMPTY = new Set<string>();

function open(campaignId: string, userId: string, qc: QueryClient): Entry {
  const channel = supabase.channel(`mesa:${campaignId}`, { config: { presence: { key: userId } } });
  const entry: Entry = { channel, refs: 0, online: new Set(), listeners: new Set() };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['campaigns', campaignId] });
    void qc.invalidateQueries({ queryKey: ['campaigns'], exact: true });
  };
  const byCampaign = `campaign_id=eq.${campaignId}`;
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_members', filter: byCampaign }, refresh);
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` }, refresh);
  // Fichas: a linha nova chega inteira; entra no cache se a versão for mais nova.
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: byCampaign }, (payload) => {
    if (payload.eventType !== 'DELETE') acceptServerRow(payload.new as CharacterRow);
    void qc.invalidateQueries({ queryKey: characterKeys.list(campaignId) });
    void qc.invalidateQueries({ queryKey: ['library', campaignId] });
  });
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: byCampaign }, () => {
    void qc.invalidateQueries({ queryKey: ['character-items'] });
  });
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rolls', filter: byCampaign }, (payload) => {
    void qc.invalidateQueries({ queryKey: ['rolls', campaignId] });
    // O nome de quem rolou vem do cache de membros da mesa.
    const members = qc.getQueryData<{ members: Array<{ user_id: string; profile: { display_name: string } | null }> }>(['campaigns', campaignId])?.members;
    const row = payload.new as RollRow;
    const author = members?.find((m) => m.user_id === row.user_id)?.profile ?? null;
    announceRoll({ ...row, author });
  });
  for (const table of ['encounters', 'combatants', 'combatant_secrets'] as const) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: byCampaign }, () => {
      void qc.invalidateQueries({ queryKey: ['combat', campaignId] });
    });
  }
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: byCampaign }, () => {
    void qc.invalidateQueries({ queryKey: ['notes', campaignId] });
  });
  channel.on('presence', { event: 'sync' }, () => {
    entry.online = new Set(Object.keys(channel.presenceState()));
    entry.listeners.forEach((l) => l());
  });
  channel.subscribe((status, err) => {
    if (import.meta.env.DEV) console.debug(`[realtime] mesa:${campaignId}`, status, err?.message ?? '');
    if (status === 'SUBSCRIBED') {
      void channel.track({ at: new Date().toISOString() });
      // Mudanças feitas entre a primeira leitura e a assinatura ficariam perdidas: relê uma vez.
      refresh();
      void qc.invalidateQueries({ queryKey: characterKeys.list(campaignId) });
      void qc.invalidateQueries({ queryKey: ['character'] });
    }
  });
  return entry;
}

export function useCampaignRealtime(campaignId: string, userId: string): Set<string> {
  const qc = useQueryClient();

  useEffect(() => {
    let entry = registry.get(campaignId);
    if (!entry) {
      entry = open(campaignId, userId, qc);
      registry.set(campaignId, entry);
    }
    clearTimeout(entry.closeTimer);
    entry.refs++;
    const current = entry;
    return () => {
      current.refs--;
      if (current.refs > 0) return;
      current.closeTimer = setTimeout(() => {
        if (current.refs > 0) return;
        registry.delete(campaignId);
        void supabase.removeChannel(current.channel);
      }, 1500);
    };
  }, [campaignId, userId, qc]);

  return useSyncExternalStore(
    (notify) => {
      const entry = registry.get(campaignId);
      entry?.listeners.add(notify);
      // O canal pode ser criado logo depois da primeira inscrição; avisa para reler.
      queueMicrotask(notify);
      return () => entry?.listeners.delete(notify);
    },
    () => registry.get(campaignId)?.online ?? EMPTY,
  );
}
