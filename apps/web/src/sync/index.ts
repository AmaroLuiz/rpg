import { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { CharacterOp } from '@rpg/engine';
import type { Json } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { clearLocalData, dexieStore, kvStorage } from './local';
import { MemoryStore, Outbox, type Batch, type SendResult } from './outbox';

export const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime longo: o que foi visto fica guardado no aparelho para abrir sem internet.
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000, gcTime: 7 * 24 * 3600 * 1000, networkMode: 'offlineFirst' },
  },
});

/** Cache das consultas no IndexedDB: o app abre com os últimos dados mesmo sem rede. */
export const persister = createAsyncStoragePersister({ storage: kvStorage, key: 'rpg-query-cache', throttleTime: 1500 });

/** Ao sair da conta: some o cache em memória e tudo que ficou no aparelho. */
export async function forgetEverything() {
  queryClient.clear();
  await persister.removeClient();
  await clearLocalData();
}

/** Códigos do Postgres que indicam falha passageira (conexão, timeout, conflito de transação). */
const TRANSIENT_SQLSTATE = /^(08|53|57P|40001|40P01|57014)/;

export function isTransient(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const err = e as { message?: string; code?: string } | null;
  const msg = err?.message ?? '';
  if (/Failed to fetch|NetworkError|fetch failed|Load failed|network|timeout/i.test(msg)) return true;
  if (err?.code && TRANSIENT_SQLSTATE.test(err.code)) return true;
  // Erro sem código do banco = gateway/5xx: tentar de novo.
  return !err?.code;
}

async function send(batch: Batch): Promise<SendResult> {
  const { data, error } = await supabase.rpc('apply_character_ops', {
    p_character: batch.characterId,
    p_op_id: batch.opId,
    p_ops: batch.ops as unknown as Json,
  });
  if (error) throw error;
  return data as unknown as SendResult;
}

type AppliedHandler = (batch: Batch, result: SendResult) => void;
const appliedHandlers = new Set<AppliedHandler>();
const rejectedHandlers = new Set<(batch: Batch) => void>();

export const onBatchApplied = (h: AppliedHandler) => (appliedHandlers.add(h), () => appliedHandlers.delete(h));
export const onBatchRejected = (h: (batch: Batch) => void) => (rejectedHandlers.add(h), () => rejectedHandlers.delete(h));

const hasIndexedDb = typeof indexedDB !== 'undefined';

export const outbox = new Outbox(hasIndexedDb ? dexieStore : new MemoryStore(), send, {
  debounceMs: 400,
  isTransient,
  newId: () => crypto.randomUUID(),
  onApplied: (b, r) => appliedHandlers.forEach((h) => h(b, r)),
  onRejected: (b) => rejectedHandlers.forEach((h) => h(b)),
});

if (typeof window !== 'undefined') {
  void outbox.start();
  window.addEventListener('online', () => outbox.retryNow());
  // Ao sair do app ou trocar de aba, fecha os rascunhos para não perder o último toque.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void outbox.sealAll();
  });
  window.addEventListener('pagehide', () => void outbox.sealAll());
}

export function useOutboxStatus() {
  return useSyncExternalStore(
    (cb) => outbox.subscribe(cb),
    () => outbox.status(),
  );
}

export function usePendingOps(characterId: string | undefined): CharacterOp[] {
  return useSyncExternalStore(
    (cb) => outbox.subscribe(cb),
    () => (characterId ? outbox.pendingOps(characterId) : NONE),
  );
}

const NONE: CharacterOp[] = [];
