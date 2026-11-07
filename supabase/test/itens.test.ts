import { afterAll, describe, expect, it } from 'vitest';
import { as, createCharacter, createTable, expectPgError, pool } from './db.js';

afterAll(() => pool.end());

async function libraryItem(gm: string, campaign: string, opts: { identified?: boolean } = {}) {
  const [it] = await as(gm, (q) =>
    q<{ id: string }>(
      `insert into public.items (campaign_id, holder_type, name, description, data, modifiers, identified)
       values ($1, 'library', $2, 'Brilha no escuro', '{"espacos": 1}', '[{"target": "defesa", "value": 1}]', $3) returning id`,
      [campaign, opts.identified === false ? 'Anel estranho' : 'Amuleto', opts.identified ?? true],
    ),
  );
  if (opts.identified === false) {
    await as(gm, (q) =>
      q(`insert into public.item_secrets (item_id, real_name, real_description, real_modifiers) values ($1, 'Anel do Medo', 'Amaldiçoado', '[{"target": "defesa", "value": -2}]')`, [it!.id]),
    );
  }
  return it!.id;
}

describe('itens', () => {
  it('mestre copia item da biblioteca para um personagem; jogador vê a cópia, não o original', async () => {
    const t = await createTable();
    const pc = await createCharacter(t.players[0]!, t.campaign);
    const lib = await libraryItem(t.gm, t.campaign);
    const [copy] = await as(t.gm, (q) => q<{ id: string; holder_id: string; equipped: boolean }>(`select id, holder_id, equipped from public.copy_item($1, 'character', $2, 2)`, [lib, pc]));
    expect(copy!.holder_id).toBe(pc);
    const seen = await as(t.players[0]!, (q) => q<{ name: string; quantity: string }>('select name, quantity from public.items'));
    expect(seen).toEqual([{ name: 'Amuleto', quantity: '2' }]);
    await expectPgError(as(t.players[0]!, (q) => q(`select public.copy_item($1, 'character', $2)`, [lib, pc])), '42501');
  });

  it('item misterioso: cópia leva o segredo; identificar revela nome e bônus verdadeiros', async () => {
    const t = await createTable();
    const pc = await createCharacter(t.players[0]!, t.campaign);
    const lib = await libraryItem(t.gm, t.campaign, { identified: false });
    const [copy] = await as(t.gm, (q) => q<{ id: string }>(`select id from public.copy_item($1, 'character', $2)`, [lib, pc]));
    expect(await as(t.players[0]!, (q) => q('select name, identified from public.items where id = $1', [copy!.id]))).toEqual([{ name: 'Anel estranho', identified: false }]);
    expect(await as(t.gm, (q) => q('select real_name from public.item_secrets where item_id = $1', [copy!.id]))).toEqual([{ real_name: 'Anel do Medo' }]);
    await expectPgError(as(t.players[0]!, (q) => q('select public.identify_item($1)', [copy!.id])), '42501');
    await as(t.gm, (q) => q('select public.identify_item($1)', [copy!.id]));
    expect(await as(t.players[0]!, (q) => q('select name, description, modifiers, identified from public.items where id = $1', [copy!.id]))).toEqual([
      { name: 'Anel do Medo', description: 'Amaldiçoado', modifiers: [{ target: 'defesa', value: -2 }], identified: true },
    ]);
    expect(await as(t.gm, (q) => q('select * from public.item_secrets where item_id = $1', [copy!.id]))).toEqual([]);
  });
});

describe('baús', () => {
  async function chest(mode: 'distribute' | 'free_pick') {
    const t = await createTable();
    const pc = await createCharacter(t.players[0]!, t.campaign);
    const other = await createCharacter(t.players[1]!, t.campaign);
    const [p] = await as(t.gm, (q) => q<{ id: string }>(`insert into public.loot_pools (campaign_id, name, mode) values ($1, 'Cofre', $2) returning id`, [t.campaign, mode]));
    const lib = await libraryItem(t.gm, t.campaign);
    const [it] = await as(t.gm, (q) => q<{ id: string }>(`select id from public.copy_item($1, 'loot', $2)`, [lib, p!.id]));
    return { t, pc, other, pool: p!.id, item: it!.id };
  }
  const take = (uid: string, item: string, ch: string) => as(uid, (q) => q('select public.take_loot_item($1, $2)', [item, ch]));

  it('baú livre: depois de revelado, jogador pega para um personagem seu', async () => {
    const c = await chest('free_pick');
    await expectPgError(take(c.t.players[0]!, c.item, c.pc), 'PT404'); // ainda escondido
    await as(c.t.gm, (q) => q('update public.loot_pools set revealed = true where id = $1', [c.pool]));
    await expectPgError(take(c.t.players[0]!, c.item, c.other), '42501'); // personagem de outro
    await take(c.t.players[0]!, c.item, c.pc);
    const mine = await as(c.t.players[0]!, (q) => q<{ holder_id: string }>(`select holder_id from public.items where id = $1`, [c.item]));
    expect(mine).toEqual([{ holder_id: c.pc }]);
    await expectPgError(take(c.t.players[1]!, c.item, c.other), 'PT404'); // já foi pego
  });

  it('baú "o mestre distribui": jogador não pega; mestre entrega', async () => {
    const c = await chest('distribute');
    await as(c.t.gm, (q) => q('update public.loot_pools set revealed = true where id = $1', [c.pool]));
    await expectPgError(take(c.t.players[0]!, c.item, c.pc), '42501');
    await take(c.t.gm, c.item, c.pc);
    expect(await as(c.t.players[0]!, (q) => q(`select holder_type from public.items where id = $1`, [c.item]))).toEqual([{ holder_type: 'character' }]);
  });
});
