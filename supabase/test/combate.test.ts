import { afterAll, describe, expect, it } from 'vitest';
import { admin, as, createCharacter, createTable, expectPgError, pool } from './db.js';

afterAll(() => pool.end());

async function encounter(gm: string, campaign: string) {
  const [e] = await as(gm, (q) => q<{ id: string }>(`insert into public.encounters (campaign_id, name) values ($1, 'Galpão') returning id`, [campaign]));
  return e!.id;
}

const add = (uid: string, enc: string, ch: string, count = 1, pv?: number, hidden = false) =>
  as(uid, (q) =>
    q<{ id: string; label: string; public_status: string | null }>(`select id, label, public_status from public.add_combatants($1, $2, $3, $4, $5)`, [
      enc,
      ch,
      count,
      JSON.stringify(pv === undefined ? {} : { pv: { atual: pv, max: pv } }),
      hidden,
    ]),
  );

describe('combatentes', () => {
  it('monstros entram numerados, com PV secreto e estado público', async () => {
    const t = await createTable();
    const enc = await encounter(t.gm, t.campaign);
    const zumbi = await createCharacter(t.gm, t.campaign, { name: 'Zumbi', kind: 'monster', visibility: 'gm' });
    const rows = await add(t.gm, enc, zumbi, 3, 12);
    expect(rows.map((r) => r.label)).toEqual(['Zumbi 1', 'Zumbi 2', 'Zumbi 3']);
    expect(rows.every((r) => r.public_status === 'ileso')).toBe(true);
    const more = await add(t.gm, enc, zumbi, 2, 12);
    expect(more.map((r) => r.label)).toEqual(['Zumbi 4', 'Zumbi 5']);
  });

  it('um só sem número; a próxima cópia continua a contagem', async () => {
    const t = await createTable();
    const enc = await encounter(t.gm, t.campaign);
    const chefe = await createCharacter(t.gm, t.campaign, { name: 'Kian', kind: 'npc', visibility: 'gm' });
    expect((await add(t.gm, enc, chefe, 1, 30)).map((r) => r.label)).toEqual(['Kian']);
    expect((await add(t.gm, enc, chefe, 1, 30)).map((r) => r.label)).toEqual(['Kian 2']);
  });

  it('PJ entra uma vez, sem PV secreto', async () => {
    const t = await createTable();
    const enc = await encounter(t.gm, t.campaign);
    const pc = await createCharacter(t.players[0]!, t.campaign, { name: 'Elena', data: { values: { nome: 'Elena' }, lists: {}, conditions: [] } });
    expect((await add(t.gm, enc, pc)).map((r) => r.label)).toEqual(['Elena']);
    await expectPgError(add(t.gm, enc, pc), '23505');
    const [{ n }] = (await admin<{ n: string }>('select count(*) n from public.combatant_secrets s join public.combatants c on c.id = s.combatant_id where c.character_id = $1', [pc])) as [{ n: string }];
    expect(Number(n)).toBe(0);
  });

  it('o estado público acompanha o PV, e o número nunca chega ao jogador', async () => {
    const t = await createTable();
    const enc = await encounter(t.gm, t.campaign);
    const zumbi = await createCharacter(t.gm, t.campaign, { name: 'Zumbi', kind: 'monster', visibility: 'gm' });
    const [z] = await add(t.gm, enc, zumbi, 1, 20);
    await as(t.gm, (q) => q(`update public.encounters set status = 'active' where id = $1`, [enc]));
    const status = async () => (await as(t.players[0]!, (q) => q<{ public_status: string }>('select public_status from public.combatants where id = $1', [z!.id])))[0]?.public_status;
    const setPv = (pv: number) => as(t.gm, (q) => q(`update public.combatant_secrets set resources = $2 where combatant_id = $1`, [z!.id, JSON.stringify({ pv: { atual: pv, max: 20 } })]));
    expect(await status()).toBe('ileso');
    await setPv(15);
    expect(await status()).toBe('ferido');
    await setPv(10);
    expect(await status()).toBe('muito_ferido');
    await setPv(0);
    expect(await status()).toBe('caido');
    expect(await as(t.players[0]!, (q) => q('select * from public.combatant_secrets'))).toEqual([]);
  });

  it('dano rápido em inimigo soma sem perder toques; só o mestre pode', async () => {
    const t = await createTable();
    const enc = await encounter(t.gm, t.campaign);
    const zumbi = await createCharacter(t.gm, t.campaign, { name: 'Zumbi', kind: 'monster', visibility: 'gm' });
    const [z] = await add(t.gm, enc, zumbi, 1, 20);
    const adj = (uid: string, delta: number, set: number | null = null) =>
      as(uid, (q) => q('select public.adjust_combatant_resource($1, $2, $3, $4)', [z!.id, 'pv', delta, set]));
    await Promise.all(Array.from({ length: 7 }, () => adj(t.gm, -1)));
    const pv = async () => (await admin<{ resources: { pv: { atual: number } } }>('select resources from public.combatant_secrets where combatant_id = $1', [z!.id]))[0]!.resources.pv.atual;
    expect(await pv()).toBe(13);
    await adj(t.gm, 0, 4);
    expect(await pv()).toBe(4);
    await expectPgError(adj(t.players[0]!, -1), '42501');
  });

  it('mesa com PV de inimigo escondido não mostra nem o estado', async () => {
    const t = await createTable();
    await as(t.gm, (q) => q(`update public.campaigns set settings = '{"enemy_hp": "hidden"}' where id = $1`, [t.campaign]));
    const enc = await encounter(t.gm, t.campaign);
    const zumbi = await createCharacter(t.gm, t.campaign, { name: 'Zumbi', kind: 'monster', visibility: 'gm' });
    const [z] = await add(t.gm, enc, zumbi, 1, 20);
    expect(z!.public_status).toBeNull();
  });

  it('só o mestre monta o combate', async () => {
    const t = await createTable();
    const enc = await encounter(t.gm, t.campaign);
    const pc = await createCharacter(t.players[0]!, t.campaign);
    await expectPgError(add(t.players[0]!, enc, pc), '42501');
  });
});

describe('iniciativa e turnos', () => {
  async function setup() {
    const t = await createTable();
    const enc = await encounter(t.gm, t.campaign);
    const zumbi = await createCharacter(t.gm, t.campaign, { name: 'Zumbi', kind: 'monster', visibility: 'gm' });
    const rows = await add(t.gm, enc, zumbi, 3, 10);
    const inits = [8, 15, 8];
    for (const [i, r] of rows.entries()) await as(t.gm, (q) => q('update public.combatants set initiative = $2 where id = $1', [r.id, inits[i]]));
    await as(t.gm, (q) => q('select public.sort_initiative($1)', [enc]));
    return { t, enc };
  }
  const order = (uid: string, enc: string) =>
    as(uid, (q) => q<{ label: string }>('select label from public.combatants where encounter_id = $1 order by order_index', [enc])).then((r) => r.map((x) => x.label));
  const turn = (uid: string, enc: string, step = 1) =>
    as(uid, (q) => q<{ round: number; turn_index: number; status: string }>('select round, turn_index, status from public.advance_turn($1, $2)', [enc, step])).then((r) => r[0]);

  it('ordena por iniciativa, empate pelo nome', async () => {
    const { t, enc } = await setup();
    expect(await order(t.gm, enc)).toEqual(['Zumbi 2', 'Zumbi 1', 'Zumbi 3']);
  });

  it('primeiro avanço inicia; no fim da ordem vira a rodada; voltar desfaz', async () => {
    const { t, enc } = await setup();
    expect(await turn(t.gm, enc)).toEqual({ round: 1, turn_index: 0, status: 'active' });
    expect(await turn(t.gm, enc)).toMatchObject({ round: 1, turn_index: 1 });
    expect(await turn(t.gm, enc)).toMatchObject({ round: 1, turn_index: 2 });
    expect(await turn(t.gm, enc)).toMatchObject({ round: 2, turn_index: 0 });
    expect(await turn(t.gm, enc, -1)).toMatchObject({ round: 1, turn_index: 2 });
    expect(await order(t.players[0]!, enc)).toEqual(['Zumbi 2', 'Zumbi 1', 'Zumbi 3']);
  });

  it('quem age é guardado pelo id, para o jogador destacar certo mesmo com escondidos', async () => {
    const { t, enc } = await setup();
    const zumbi = (await admin<{ character_id: string }>('select character_id from public.combatants where encounter_id = $1 limit 1', [enc]))[0]!.character_id;
    const [hidden] = await add(t.gm, enc, zumbi, 1, 10, true);
    await as(t.gm, (q) => q('update public.combatants set initiative = 99 where id = $1', [hidden!.id]));
    await as(t.gm, (q) => q('select public.sort_initiative($1)', [enc]));
    await turn(t.gm, enc); // começa: o escondido (iniciativa 99) age primeiro
    const current = async () =>
      (await as(t.players[0]!, (q) => q<{ current_combatant_id: string | null }>('select current_combatant_id from public.encounters where id = $1', [enc])))[0]!.current_combatant_id;
    expect(await current()).toBe(hidden!.id);
    expect((await order(t.players[0]!, enc))).not.toContain(hidden!.label);
    await turn(t.gm, enc);
    const [z2] = await as(t.players[0]!, (q) => q<{ id: string }>(`select id from public.combatants where encounter_id = $1 and label = 'Zumbi 2'`, [enc]));
    expect(await current()).toBe(z2!.id);
  });

  it('jogador não avança turno; combate vazio não começa', async () => {
    const { t, enc } = await setup();
    await expectPgError(turn(t.players[0]!, enc), '42501');
    const empty = await encounter(t.gm, t.campaign);
    await expectPgError(turn(t.gm, empty), '22023');
  });
});
