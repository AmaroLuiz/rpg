import type { CharacterOp } from '@rpg/engine';

/**
 * Fila de envio das mudanças da ficha.
 *
 * - Toques rápidos ("−1 PV" cinco vezes) entram num rascunho por personagem e viram um lote
 *   só depois de `debounceMs` sem mudanças.
 * - Lotes vão ao servidor um por vez, na ordem em que foram criados. Cada lote tem um id;
 *   o servidor ignora um lote repetido, então reenviar depois de uma queda é seguro.
 * - Falha de rede ou do servidor (5xx): o lote fica e é reenviado com espera crescente.
 * - Recusa (sem permissão, operação inválida): o lote é descartado e a falha é avisada.
 * - Lotes ficam guardados no aparelho (OutboxStore) e sobrevivem a fechar o app.
 */

export interface Batch {
  opId: string;
  characterId: string;
  ops: CharacterOp[];
  createdAt: number;
}

export interface OutboxStore {
  load(): Promise<Batch[]>;
  add(batch: Batch): Promise<void>;
  remove(opId: string): Promise<void>;
}

export interface SendResult {
  version: number;
  duplicate: boolean;
}

export type Sender = (batch: Batch) => Promise<SendResult>;

export interface OutboxStatus {
  /** Mudanças ainda não confirmadas pelo servidor (lotes + rascunhos). */
  pending: number;
  sending: boolean;
  /** Último envio falhou por rede; tentando de novo. */
  offline: boolean;
  /** Última recusa do servidor, para mostrar à pessoa. */
  lastRejection: string | null;
}

export interface OutboxOptions {
  debounceMs?: number;
  /** Espera antes de reenviar após falha de rede: 1s, 2s, 4s… até maxRetryMs. */
  retryBaseMs?: number;
  maxRetryMs?: number;
  /** true = falha passageira (rede, 5xx): manter e reenviar. false = recusa definitiva. */
  isTransient(error: unknown): boolean;
  newId(): string;
  onApplied?(batch: Batch, result: SendResult): void;
  onRejected?(batch: Batch, error: unknown): void;
  now?(): number;
}

type Listener = () => void;

const EMPTY_OPS: CharacterOp[] = [];

export class Outbox {
  private batches: Batch[] = [];
  private readonly drafts = new Map<string, { ops: CharacterOp[]; timer: ReturnType<typeof setTimeout> }>();
  private readonly listeners = new Set<Listener>();
  private sending = false;
  private offline = false;
  private lastRejection: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay: number;
  private snapshot: OutboxStatus;
  private loaded: Promise<void> | null = null;
  /** Sobe a cada mudança; serve de chave para o cache de pendingOps (referência estável para o React). */
  private revision = 0;
  private readonly pendingCache = new Map<string, { revision: number; ops: CharacterOp[] }>();

  constructor(
    private readonly store: OutboxStore,
    private readonly send: Sender,
    private readonly opts: OutboxOptions,
  ) {
    this.retryDelay = opts.retryBaseMs ?? 1000;
    this.snapshot = this.computeStatus();
  }

  /** Carrega lotes guardados de uma sessão anterior e começa a enviar. */
  start(): Promise<void> {
    this.loaded ??= this.store.load().then((saved) => {
      const known = new Set(this.batches.map((b) => b.opId));
      this.batches = [...saved.filter((b) => !known.has(b.opId)), ...this.batches].sort((a, b) => a.createdAt - b.createdAt);
      this.notify();
      void this.flush();
    });
    return this.loaded;
  }

  enqueue(characterId: string, ops: CharacterOp[]): void {
    if (!ops.length) return;
    const draft = this.drafts.get(characterId);
    if (draft) clearTimeout(draft.timer);
    const next = { ops: [...(draft?.ops ?? []), ...ops], timer: setTimeout(() => void this.seal(characterId), this.opts.debounceMs ?? 350) };
    this.drafts.set(characterId, next);
    this.notify();
  }

  /** Operações ainda não confirmadas de um personagem, na ordem certa (lotes, depois rascunho). */
  pendingOps(characterId: string): CharacterOp[] {
    const hit = this.pendingCache.get(characterId);
    if (hit && hit.revision === this.revision) return hit.ops;
    const sealed = this.batches.filter((b) => b.characterId === characterId).flatMap((b) => b.ops);
    const draft = this.drafts.get(characterId)?.ops ?? [];
    const ops = sealed.length || draft.length ? [...sealed, ...draft] : EMPTY_OPS;
    // Mesma lista de antes se nada mudou para este personagem: evita redesenhar a ficha à toa.
    const same = hit && hit.ops.length === ops.length && hit.ops.every((o, i) => o === ops[i]);
    const stable = same ? hit.ops : ops;
    this.pendingCache.set(characterId, { revision: this.revision, ops: stable });
    return stable;
  }

  /** Fecha todos os rascunhos agora (ex.: app indo para segundo plano). */
  async sealAll(): Promise<void> {
    await Promise.all([...this.drafts.keys()].map((id) => this.seal(id)));
  }

  /** Tenta enviar agora, sem esperar a próxima tentativa (ex.: a rede voltou). */
  retryNow(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryDelay = this.opts.retryBaseMs ?? 1000;
    void this.flush();
  }

  status(): OutboxStatus {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dismissRejection(): void {
    this.lastRejection = null;
    this.notify();
  }

  private computeStatus(): OutboxStatus {
    let pending = 0;
    for (const b of this.batches) pending += b.ops.length;
    for (const d of this.drafts.values()) pending += d.ops.length;
    return { pending, sending: this.sending, offline: this.offline, lastRejection: this.lastRejection };
  }

  private notify() {
    this.revision++;
    this.snapshot = this.computeStatus();
    this.listeners.forEach((l) => l());
  }

  private async seal(characterId: string): Promise<void> {
    const draft = this.drafts.get(characterId);
    if (!draft) return;
    clearTimeout(draft.timer);
    this.drafts.delete(characterId);
    const batch: Batch = { opId: this.opts.newId(), characterId, ops: draft.ops, createdAt: (this.opts.now ?? Date.now)() };
    this.batches.push(batch);
    this.notify();
    await this.store.add(batch);
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.sending || this.retryTimer) return;
    this.sending = true;
    this.notify();
    try {
      while (this.batches.length) {
        const batch = this.batches[0]!;
        try {
          const result = await this.send(batch);
          this.batches.shift();
          await this.store.remove(batch.opId);
          this.offline = false;
          this.retryDelay = this.opts.retryBaseMs ?? 1000;
          this.opts.onApplied?.(batch, result);
          this.notify();
        } catch (error) {
          if (this.opts.isTransient(error)) {
            this.offline = true;
            const delay = this.retryDelay;
            this.retryDelay = Math.min(this.retryDelay * 2, this.opts.maxRetryMs ?? 30_000);
            this.retryTimer = setTimeout(() => {
              this.retryTimer = undefined;
              void this.flush();
            }, delay);
            return;
          }
          this.batches.shift();
          await this.store.remove(batch.opId);
          this.lastRejection = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
          this.opts.onRejected?.(batch, error);
          this.notify();
        }
      }
    } finally {
      this.sending = false;
      this.notify();
    }
  }
}

/** Guarda em memória; para testes e para quando o IndexedDB não existe. */
export class MemoryStore implements OutboxStore {
  readonly saved = new Map<string, Batch>();
  async load() {
    return [...this.saved.values()];
  }
  async add(b: Batch) {
    this.saved.set(b.opId, b);
  }
  async remove(opId: string) {
    this.saved.delete(opId);
  }
}
