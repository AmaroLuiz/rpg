import Dexie, { type Table } from 'dexie';
import type { Batch, OutboxStore } from './outbox';

/** Cópia local no aparelho: fila de envio, últimas fichas abertas e templates. */
class LocalDb extends Dexie {
  outbox!: Table<Batch, string>;
  characters!: Table<{ id: string; campaign_id: string } & Record<string, unknown>, string>;
  templates!: Table<{ id: string; schema: unknown }, string>;

  constructor() {
    super('rpg-mesa');
    this.version(1).stores({ outbox: 'opId, createdAt', characters: 'id, campaign_id', templates: 'id' });
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
