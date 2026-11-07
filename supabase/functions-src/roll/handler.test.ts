import { applyOps, fixedRng, newCharacterData } from '@rpg/engine';
import { builtinTemplates, builtinTemplate } from '../../../packages/templates/src/index';
import { describe, expect, it } from 'vitest';
import { handleRoll, type CharacterForRoll, type RollRow, type RollStore } from './handler';

const CAMPAIGN = '00000000-0000-4000-8000-000000000001';
const CHAR = '00000000-0000-4000-8000-0000000000c1';
const GM = 'gm';
const OWNER = 'dono';
const OTHER = 'outro';

function makeStore(uid: string | null, extra: Partial<CharacterForRoll> = {}) {
  const tpl = builtinTemplate('ordem_paranormal');
  let data = newCharacterData(tpl);
  data = applyOps(data, [
    { op: 'set', path: ['values', 'for'], value: 3 },
    { op: 'set', path: ['lists', 'pericias', 'items', 'luta', 'grau'], value: 5 },
  ]);
  const inserted: Array<Omit<RollRow, 'id' | 'created_at'>> = [];
  const store: RollStore = {
    userId: async () => uid,
    role: async (_c, u) => (u === GM ? 'gm' : u === OWNER || u === OTHER ? 'player' : null),
    character: async (id) => (id === CHAR ? { id: CHAR, campaign_id: CAMPAIGN, owner_id: OWNER, name: 'Elena', data, template_version_id: 'v2', ...extra } : null),
    templateSchema: async () => builtinTemplates.ordem_paranormal,
    items: async () => [],
    insertRoll: async (row) => {
      inserted.push(row);
      return { ...row, id: 'r1', created_at: 'agora' };
    },
  };
  return { store, inserted };
}

const luta = { campaign_id: CAMPAIGN, character_id: CHAR, roll_id: 'pericia', item_key: 'luta' };

describe('rolagem no servidor', () => {
  it('rola pela ficha salva: Luta com 3d20 + 5, rótulo com o nome', async () => {
    const { store, inserted } = makeStore(OWNER);
    const res = await handleRoll(luta, store, fixedRng([4, 17, 9]));
    expect(res.status).toBe(200);
    expect(inserted[0]).toMatchObject({ label: 'Elena: Luta', total: 22, visibility: 'public', user_id: OWNER, character_id: CHAR });
    expect(inserted[0]!.result.text).toBe('3d20kh1 [(4), 17, (9)] + 5');
  });

  it('bônus situacional e dados extras', async () => {
    const { store, inserted } = makeStore(OWNER);
    await handleRoll({ ...luta, bonus: 2, dados: 1 }, store, fixedRng([1, 2, 3, 20]));
    expect(inserted[0]!.result.dice[0]!.notation).toBe('4d20kh1');
    expect(inserted[0]!.total).toBe(20 + 5 + 2);
  });

  it('rolagem livre sem ficha', async () => {
    const { store, inserted } = makeStore(OTHER);
    const res = await handleRoll({ campaign_id: CAMPAIGN, expression: '2d6+1', label: 'Dano', bonus: -1 }, store, fixedRng([3, 4]));
    expect(res.status).toBe(200);
    expect(inserted[0]).toMatchObject({ label: 'Dano', total: 7, character_id: null });
    expect(inserted[0]!.result.text).toBe('2d6 [3, 4] + 1 − 1 (situacional)');
  });

  it('mestre rola por qualquer personagem; outro jogador não', async () => {
    expect((await handleRoll(luta, makeStore(GM).store, fixedRng([10, 10, 10]))).status).toBe(200);
    const res = await handleRoll(luta, makeStore(OTHER).store, fixedRng([10]));
    expect(res).toEqual({ status: 403, body: { error: 'Só o dono ou o mestre rola por este personagem' } });
  });

  it('secreta só para o mestre; "só para o mestre" do mestre vira secreta', async () => {
    expect((await handleRoll({ ...luta, visibility: 'gm' }, makeStore(OWNER).store, fixedRng([1, 1, 1]))).status).toBe(403);
    const { store, inserted } = makeStore(GM);
    await handleRoll({ ...luta, visibility: 'self_gm' }, store, fixedRng([1, 1, 1]));
    expect(inserted[0]!.visibility).toBe('gm');
    const p = makeStore(OWNER);
    await handleRoll({ ...luta, visibility: 'self_gm' }, p.store, fixedRng([1, 1, 1]));
    expect(p.inserted[0]!.visibility).toBe('self_gm');
  });

  it('recusa quem não está logado, quem não é da mesa e pedidos inválidos', async () => {
    expect((await handleRoll(luta, makeStore(null).store, fixedRng([1]))).status).toBe(401);
    expect((await handleRoll(luta, makeStore('estranho').store, fixedRng([1]))).status).toBe(403);
    expect((await handleRoll({ campaign_id: CAMPAIGN }, makeStore(OWNER).store, fixedRng([1]))).status).toBe(400);
    expect((await handleRoll({ campaign_id: CAMPAIGN, roll_id: 'pericia' }, makeStore(OWNER).store, fixedRng([1]))).status).toBe(400);
  });

  it('personagem de outra mesa não é encontrado; erro do motor vira 400 em português', async () => {
    expect((await handleRoll(luta, makeStore(OWNER, { campaign_id: 'outra' }).store, fixedRng([1]))).status).toBe(404);
    const res = await handleRoll({ campaign_id: CAMPAIGN, expression: '101d6' }, makeStore(OWNER).store, fixedRng([1]));
    expect(res).toEqual({ status: 400, body: { error: 'No máximo 100 dados por grupo (pediu 101)' } });
  });
});
