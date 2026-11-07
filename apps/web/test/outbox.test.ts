import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore, Outbox, type Batch, type SendResult } from '../src/sync/outbox';

class NetworkError extends Error {}
class Rejected extends Error {}

function setup(sendImpl?: (b: Batch) => Promise<SendResult>) {
  const store = new MemoryStore();
  const sent: Batch[] = [];
  const applied: string[] = [];
  const rejected: string[] = [];
  let n = 0;
  let version = 0;
  const send = vi.fn(async (b: Batch) => {
    if (sendImpl) return sendImpl(b);
    sent.push(b);
    return { version: ++version, duplicate: false };
  });
  const outbox = new Outbox(store, send, {
    debounceMs: 300,
    retryBaseMs: 1000,
    maxRetryMs: 4000,
    isTransient: (e) => e instanceof NetworkError,
    newId: () => `op${++n}`,
    onApplied: (b) => applied.push(b.opId),
    onRejected: (b) => rejected.push(b.opId),
  });
  return { outbox, store, send, sent, applied, rejected };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const inc = (by: number) => ({ op: 'inc' as const, path: ['values', 'pv', 'atual'], by });

describe('fila de envio', () => {
  it('agrupa toques rápidos num lote só', async () => {
    const { outbox, sent } = setup();
    await outbox.start();
    for (let i = 0; i < 5; i++) {
      outbox.enqueue('c1', [inc(-1)]);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(outbox.status().pending).toBe(5);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.ops).toHaveLength(5);
    expect(outbox.status().pending).toBe(0);
  });

  it('mostra as operações pendentes em ordem, lotes antes do rascunho', async () => {
    const { outbox } = setup(() => new Promise(() => {})); // servidor nunca responde
    await outbox.start();
    outbox.enqueue('c1', [inc(-1)]);
    await vi.advanceTimersByTimeAsync(300);
    outbox.enqueue('c1', [inc(-2)]);
    outbox.enqueue('c2', [inc(-9)]);
    expect(outbox.pendingOps('c1').map((o) => (o as { by: number }).by)).toEqual([-1, -2]);
    expect(outbox.pendingOps('c2')).toHaveLength(1);
  });

  it('sem rede: guarda, espera cada vez mais e envia quando volta, sem perder ordem', async () => {
    let online = false;
    const delivered: string[] = [];
    const { outbox, send } = setup(async (b) => {
      if (!online) throw new NetworkError('Failed to fetch');
      delivered.push(b.opId);
      return { version: delivered.length, duplicate: false };
    });
    await outbox.start();
    outbox.enqueue('c1', [inc(-1)]);
    await vi.advanceTimersByTimeAsync(300);
    outbox.enqueue('c1', [inc(-2)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(outbox.status()).toMatchObject({ offline: true, pending: 2 });
    // 1ª falha em t=300 ms; reenvio marcado para t=1300 ms. Agora estamos em t=600 ms.
    const callsAfterFirstFail = send.mock.calls.length;
    expect(callsAfterFirstFail).toBe(1);
    await vi.advanceTimersByTimeAsync(699);
    expect(send.mock.calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send.mock.calls.length).toBe(2); // reenviou 1 s depois da falha
    await vi.advanceTimersByTimeAsync(2000); // depois de 2s
    await vi.advanceTimersByTimeAsync(4000); // depois de 4s (teto)
    await vi.advanceTimersByTimeAsync(4000); // continua em 4s
    online = true;
    outbox.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(delivered).toEqual(['op1', 'op2']);
    expect(outbox.status()).toMatchObject({ offline: false, pending: 0 });
  });

  it('lotes sobrevivem a fechar o app e são enviados na próxima abertura', async () => {
    const first = setup(async () => {
      throw new NetworkError('offline');
    });
    await first.outbox.start();
    first.outbox.enqueue('c1', [inc(-3)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(first.store.saved.size).toBe(1);

    // "Reabre o app" com o mesmo armazenamento.
    const sent: Batch[] = [];
    const second = new Outbox(first.store, async (b) => (sent.push(b), { version: 1, duplicate: false }), {
      isTransient: () => true,
      newId: () => 'novo',
    });
    await second.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.map((b) => b.opId)).toEqual(['op1']);
    expect(first.store.saved.size).toBe(0);
  });

  it('recusa do servidor descarta o lote, avisa e segue para o próximo', async () => {
    const { outbox, applied, rejected } = setup(async (b) => {
      if (b.characterId === 'proibido') throw new Rejected('Personagem não encontrado ou sem permissão');
      return { version: 1, duplicate: false };
    });
    await outbox.start();
    outbox.enqueue('proibido', [inc(-1)]);
    outbox.enqueue('c1', [inc(-1)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(rejected).toEqual(['op1']);
    expect(applied).toEqual(['op2']);
    expect(outbox.status().lastRejection).toBe('Personagem não encontrado ou sem permissão');
    outbox.dismissRejection();
    expect(outbox.status().lastRejection).toBeNull();
  });

  it('sealAll fecha os rascunhos na hora', async () => {
    const { outbox, sent } = setup();
    await outbox.start();
    outbox.enqueue('c1', [inc(-1)]);
    await outbox.sealAll();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
  });

  it('avisa quem está ouvindo, com objeto de status estável entre mudanças', async () => {
    const { outbox } = setup();
    await outbox.start();
    const seen: number[] = [];
    outbox.subscribe(() => seen.push(outbox.status().pending));
    const s1 = outbox.status();
    expect(outbox.status()).toBe(s1);
    outbox.enqueue('c1', [inc(-1)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(0);
  });
});
