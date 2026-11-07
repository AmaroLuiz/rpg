import Dexie, { type Table } from 'dexie';
import type { Batch, OutboxStore } from './outbox';

/** Cópia local no aparelho: fila de envio, últimas fichas abertas e templates. */
class LocalDb extends Dexie {
  outbox!: Table<Batch, string>;
  characters!: Table<{ id: string; campaign_id: string } & Record<string, unknown>, string>;
  templates!: Table<{ id: string; schema: unknown }, string>;
  kv!: Table<{ key: string; value: string }, string>;
  rollQueue!: Table<{ id: string; createdAt: number; request: unknown; result: unknown }, string>;

  constructor() {
    super('rpg-mesa');
    this.version(1).stores({ outbox: 'opId, createdAt', characters: 'id, campaign_id', templates: 'id' });
    // v2: cache das consultas (abrir sem internet) e fila de rolagens feitas offline.
    this.version(2).stores({ kv: 'key', rollQueue: 'id, createdAt' });
  }
}

export const localDb = new LocalDb();

export const dexieStore: OutboxStore = {
  load: () => localDb.outbox.orderBy('createdAt').toArray(),
  add: async (b) => {
    await localDb.outbox.put(b);
  },
  remove: async (opId) => {
    await localDb.outbox.delete(opId);
  },
};

/** Armazenamento chave-valor para a persistência do React Query. */
export const kvStorage = {
  getItem: async (key: string) => (await localDb.kv.get(key))?.value ?? null,
  setItem: async (key: string, value: string) => {
    await localDb.kv.put({ key, value });
  },
  removeItem: async (key: string) => {
    await localDb.kv.delete(key);
  },
};

/** Apaga tudo que o aparelho guardou desta conta (ao sair da conta). */
export async function clearLocalData() {
  await Promise.all([localDb.kv.clear(), localDb.characters.clear(), localDb.templates.clear(), localDb.outbox.clear(), localDb.rollQueue.clear()]);
}
