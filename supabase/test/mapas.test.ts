import { afterAll, describe, expect, it } from 'vitest';
import { admin, as, createCharacter, createTable, expectPgError, pool } from './db.js';

afterAll(() => pool.end());

async function newMap(gm: string, campaign: string, opts: { revealed?: boolean; cols?: number; rows?: number; fog?: boolean } = {}) {
  const [m] = await as(gm, (q) =>
    q<{ id: string }>(`insert into public.maps (campaign_id, name, cols, rows, revealed, fog_enabled) values ($1, 'Galpão', $2, $3, $4, $5) returning id`, [
      campaign,
      opts.cols ?? 10,
      opts.rows ?? 10,
      opts.revealed ?? false,
      opts.fog ?? false,
    ]),
  );
  return m!.id;
}

async function token(gm: string, map: string, opts: { character?: string; combatant?: string; x?: number; y?: number; size?: number; hidden?: boolean; label?: string } = {}) {
  const [t] = await as(gm, (q) =>
    q<{ id: string }>(
      `insert into public.map_tokens (map_id, campaign_id, character_id, combatant_id, label, x, y, size, hidden)
       values ($1, '00000000-0000-0000-0000-000000000000', $2, $3, $4, $5, $6, $7, $8) returning id`,
      [map, opts.character ?? null, opts.combatant ?? null, opts.label ?? 'Token', opts.x ?? 0, opts.y ?? 0, opts.size ?? 1, opts.hidden ?? false],
    ),
  );
  return t!.id;
}

const visibleTokens = (uid: string, map: string) =>
  as(uid, (q) => q<{ label: string }>('select label from public.map_tokens where map_id = $1 order by label', [map])).then((r) => r.map((x) => x.label));

describe('mapas', () => {
  it('jogador só vê mapa revelado; quem é de fora não vê nada', async () => {
    const t = await createTable();
    const hidden = await newMap(t.gm, t.campaign);
    const shown = await newMap(t.gm, t.campaign, { revealed: true });
    const ids = (uid: string) => as(uid, (q) => q<{ id: string }>('select id from public.maps')).then((r) => r.map((x) => x.id));
    expect((await ids(t.gm)).sort()).toEqual([hidden, shown].sort());
    expect(await ids(t.players[0]!)).toEqual([shown]);
    expect(await ids(t.outsider)).toEqual([]);
    await expectPgError(as(t.players[0]!, (q) => q(`insert into public.maps (campaign_id, name) values ($1, 'X')`, [t.campaign])), '42501');
  });

  it('um só mapa na mesa; ativar revela; só o mestre escolhe', async () => {
    const t = await createTable();
    const a = await newMap(t.gm, t.campaign);
    const b = await newMap(t.gm, t.campaign);
    const setActive = (uid: string, map: string | null) => as(uid, (q) => q('select public.set_active_map($1, $2)', [t.campaign, map]));
    await setActive(t.gm, a);
    await setActive(t.gm, b);
    const rows = await admin<{ id: string; active: boolean; revealed: boolean }>('select id, active, revealed from public.maps where campaign_id = $1', [t.campaign]);
    expect(rows.find((r) => r.id === a)).toMatchObject({ active: false, revealed: true });
    expect(rows.find((r) => r.id === b)).toMatchObject({ active: true, revealed: true });
    await expectPgError(setActive(t.players[0]!, a), '42501');
    await setActive(t.gm, null);
    expect((await admin('select 1 from public.maps where campaign_id = $1 and active', [t.campaign])).length).toBe(0);
  });
});

describe('tokens', () => {
  it('jogador move o próprio token, não muda tamanho nem move o dos outros', async () => {
    const t = await createTable();
    const map = await newMap(t.gm, t.campaign, { revealed: true });
    const elena = await createCharacter(t.players[0]!, t.campaign, { name: 'Elena' });
    const bruno = await createCharacter(t.players[1]!, t.campaign, { name: 'Bruno' });
    const te = await token(t.gm, map, { character: elena, label: 'Elena' });
    const tb = await token(t.gm, map, { character: bruno, label: 'Bruno', x: 5 });
    await as(t.players[0]!, (q) => q('update public.map_tokens set x = 3, y = 4 where id = $1', [te]));
    expect((await admin<{ x: number; y: number }>('select x, y from public.map_tokens where id = $1', [te]))[0]).toEqual({ x: 3, y: 4 });
    await expectPgError(as(t.players[0]!, (q) => q('update public.map_tokens set size = 2 where id = $1', [te])), '42501');
    const moved = await as(t.players[0]!, (q) => q('update public.map_tokens set x = 1 where id = $1 returning id', [tb]));
    expect(moved).toEqual([]);
    await expectPgError(as(t.players[0]!, (q) => q('insert into public.map_tokens (map_id, campaign_id, label) values ($1, $2, $3)', [map, t.campaign, 'X'])), '42501');
  });

  it('token não sai do grid', async () => {
    const t = await createTable();
    const map = await newMap(t.gm, t.campaign, { cols: 5, rows: 5 });
    await expectPgError(token(t.gm, map, { x: 4, size: 2 }), '22023');
    const ok = await token(t.gm, map, { x: 3, y: 3, size: 2 });
    expect(ok).toBeTruthy();
  });

  it('escondido, sob a névoa ou de combatente escondido não chega ao jogador', async () => {
    const t = await createTable();
    const map = await newMap(t.gm, t.campaign, { revealed: true, cols: 4, rows: 2, fog: true });
    // revela só a primeira linha
    await as(t.gm, (q) => q(`update public.maps set fog = '11110000' where id = $1`, [map]));
    const zumbi = await createCharacter(t.gm, t.campaign, { name: 'Zumbi', kind: 'monster', visibility: 'gm' });
    const [enc] = await as(t.gm, (q) => q<{ id: string }>(`insert into public.encounters (campaign_id, name, status) values ($1, 'Luta', 'active') returning id`, [t.campaign]));
    const [z1] = await as(t.gm, (q) => q<{ id: string }>(`select id from public.add_combatants($1, $2, 1, '{}', true)`, [enc!.id, zumbi]));
    const elena = await createCharacter(t.players[0]!, t.campaign, { name: 'Elena' });

    await token(t.gm, map, { label: 'A-luz', x: 0, y: 0 });
    await token(t.gm, map, { label: 'B-sombra', x: 0, y: 1 });
    await token(t.gm, map, { label: 'C-escondido', x: 1, y: 0, hidden: true });
    await token(t.gm, map, { label: 'D-combatente-escondido', x: 2, y: 0, combatant: z1!.id });
    await token(t.gm, map, { label: 'E-grande-meio-na-luz', x: 2, y: 0, size: 2 });
    await token(t.gm, map, { label: 'F-elena-na-sombra', x: 3, y: 1, character: elena });

    expect(await visibleTokens(t.gm, map)).toHaveLength(6);
    expect(await visibleTokens(t.players[0]!, map)).toEqual(['A-luz', 'E-grande-meio-na-luz', 'F-elena-na-sombra']);
    expect(await visibleTokens(t.players[1]!, map)).toEqual(['A-luz', 'E-grande-meio-na-luz']);

    // névoa desligada: o que está na sombra aparece
    await as(t.gm, (q) => q('update public.maps set fog_enabled = false where id = $1', [map]));
    expect(await visibleTokens(t.players[1]!, map)).toEqual(['A-luz', 'B-sombra', 'E-grande-meio-na-luz', 'F-elena-na-sombra']);
  });

  it('entrar na névoa avisa os jogadores tocando o mapa', async () => {
    const t = await createTable();
    const map = await newMap(t.gm, t.campaign, { revealed: true, cols: 2, rows: 1, fog: true });
    await as(t.gm, (q) => q(`update public.maps set fog = '10' where id = $1`, [map]));
    const tk = await token(t.gm, map, { x: 0 });
    const stamp = async () => (await admin<{ updated_at: Date }>('select updated_at from public.maps where id = $1', [map]))[0]!.updated_at.getTime();
    const before = await stamp();
    await as(t.gm, (q) => q('update public.map_tokens set x = 1 where id = $1', [tk]));
    expect(await stamp()).toBeGreaterThan(before);
  });
});

describe('marcas', () => {
  it('jogador marca à vista de todos; marca só do mestre fica com ele', async () => {
    const t = await createTable();
    const map = await newMap(t.gm, t.campaign, { revealed: true });
    const mark = (uid: string, gmOnly: boolean, text: string) =>
      as(uid, (q) =>
        q(`insert into public.map_marks (map_id, campaign_id, author_id, kind, data, gm_only) values ($1, $2, $3, 'pin', $4, $5)`, [
          map,
          t.campaign,
          uid,
          JSON.stringify({ x: 10, y: 10, text }),
          gmOnly,
        ]),
      );
    await mark(t.gm, true, 'armadilha');
    await mark(t.gm, false, 'porta');
    await mark(t.players[0]!, false, 'aqui!');
    await expectPgError(mark(t.players[0]!, true, 'segredo'), '42501');
    const texts = (uid: string) =>
      as(uid, (q) => q<{ text: string }>(`select data->>'text' as text from public.map_marks where map_id = $1 order by 1`, [map])).then((r) => r.map((x) => x.text));
    expect(await texts(t.gm)).toEqual(['aqui!', 'armadilha', 'porta']);
    expect(await texts(t.players[1]!)).toEqual(['aqui!', 'porta']);
    // jogador não apaga marca alheia
    const gone = await as(t.players[1]!, (q) => q(`delete from public.map_marks where map_id = $1 returning id`, [map]));
    expect(gone).toEqual([]);
  });
});
