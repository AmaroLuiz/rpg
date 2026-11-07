import type { RollResult } from '@rpg/engine';
import { useSyncExternalStore } from 'react';
import type { RollRequest } from '../api/rolls';
import { supabase } from '../lib/supabase';
import { localDb } from '../sync/local';
import { queryClient } from '../sync';

/**
 * Rolagens feitas sem internet: ficam no aparelho e vão ao histórico quando a rede volta,
 * marcadas como "offline" para todos.
 */

export interface QueuedRoll {
  id: string;
  createdAt: number;
  request: RollRequest;
  result: RollResult;
}

let queued: QueuedRoll[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
let flushing = false;

async function load() {
  if (typeof indexedDB === 'undefined') return;
  queued = (await localDb.rollQueue.orderBy('createdAt').toArray()) as QueuedRoll[];
  notify();
}

export async function queueOfflineRoll(request: RollRequest, result: RollResult): Promise<QueuedRoll> {
  const q: QueuedRoll = { id: crypto.randomUUID(), createdAt: Date.now(), request, result };
  await localDb.rollQueue.put(q);
  queued = [...queued, q];
  notify();
  return q;
}

export async function flushOfflineRolls() {
  if (flushing || !queued.length) return;
  flushing = true;
  try {
    for (const q of [...queued]) {
      const { error } = await supabase.functions.invoke('roll', {
        body: { ...q.request, offline_result: { ...q.result, rolled_at: new Date(q.createdAt).toISOString() } },
      });
      const status = (error as { context?: Response } | null)?.context?.status;
      // Falha de rede: para e tenta depois. Recusa (4xx): descarta para não travar a fila.
      if (error && (status === undefined || status >= 500)) break;
      await localDb.rollQueue.delete(q.id);
      queued = queued.filter((x) => x.id !== q.id);
      notify();
      void queryClient.invalidateQueries({ queryKey: ['rolls', q.request.campaign_id] });
    }
  } finally {
    flushing = false;
  }
}

export function useQueuedRolls(campaignId: string): QueuedRoll[] {
  const all = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => queued,
  );
  return all.filter((q) => q.request.campaign_id === campaignId);
}

if (typeof window !== 'undefined') {
  void load().then(flushOfflineRolls);
  window.addEventListener('online', () => void flushOfflineRolls());
}
