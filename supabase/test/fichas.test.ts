import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { applyOps, type CharacterData, type CharacterOp } from '../../packages/engine/src/index.js';
import { admin, as, asService, createCharacter, createTable, expectPgError, pool } from './db.js';

afterAll(() => pool.end());

const ops = (uid: string, character: string, list: CharacterOp[], opId = randomUUID()) =>
  as(uid, (q) => q<{ apply_character_ops: { version: number; duplicate: boolean } }>('select public.apply_character_ops($1, $2, $3)', [character, opId, JSON.stringify(list)])).then(
    (r) => r[0]!.apply_character_ops,
  );

const dataOf = async (id: string) => (await admin<{ data: CharacterData }>('select data from public.characters where id = $1', [id]))[0]!.data;

describe('personagens', () => {
  it('jogador cria PJ na versão atual do template; outros membros veem, quem é de fora não', async () => {
    const t = await createTable();
    const id = await createCharacter(t.players[0]!, t.campaign, { name: 'Elena' });
    const [row] = await admin<{ version: number; slug: string }>(
      `select tv.version, tp.slug from public.characters c join public.template_versions tv on tv.id = c.template_version_id join public.templates tp on tp.id = tv.template_id where c.id = $1`,
      [id],
    );
    expect(row).toEqual({ version: 1, slug: 'ordem_paranormal' });
    expect(await as(t.players[1]!, (q) => q('select id from public.characters where id = $1', [id]))).toHaveLength(1);
    expect(await as(t.outsider, (q) => q('select id from public.characters where id = $1', [id]))).toEqual([]);
  });

  it('quem é de fora não cria personagem na mesa (nem descobre que ela existe)', async () => {
    const t = await createTable();
    await expectPgError(createCharacter(t.outsider, t.campaign), 'PT404');
  });

  it('jogador não cria NPC nem ficha escondida; mestre cria monstro só dele', async () => {
    const t = await createTable();
    await expectPgError(createCharacter(t.players[0]!, t.campaign, { kind: 'npc' }), '42501');
    await expectPgError(createCharacter(t.players[0]!, t.campaign, { visibility: 'gm' }), '42501');
    const monster = await createCharacter(t.gm, t.campaign, { name: 'Zumbi de Sangue', kind: 'monster', visibility: 'gm' });
    expect(await as(t.players[0]!, (q) => q('select id from public.characters where id = $1', [monster]))).toEqual([]);
    expect(await as(t.gm, (q) => q('select id from public.characters where id = $1', [monster]))).toHaveLength(1);
  });

  it('versão de template de outro sistema é recusada', async () => {
    const t = await createTable();
    const [tv] = await admin<{ id: string }>(
      `select v.id from public.template_versions v join public.templates t on t.id = v.template_id where t.slug = 'tormenta20'`,
    );
    await expectPgError(
      as(t.players[0]!, (q) =>
        q(`insert into public.characters (campaign_id, owner_id, template_version_id) values ($1, $2, $3)`, [t.campaign, t.players[0], tv!.id]),
      ),
      '23514',
    );
  });

  it('jogador não muda a própria visibilidade nem escreve data direto', async () => {
    const t = await createTable();
    const id = await createCharacter(t.players[0]!, t.campaign);
    await expectPgError(as(t.players[0]!, (q) => q(`update public.characters set visibility = 'gm' where id = $1`, [id])), '42501');
    await expectPgError(as(t.players[0]!, (q) => q(`update public.characters set data = '{}' where id = $1`, [id])), '42501');
    const renamed = await as(t.players[0]!, (q) => q(`update public.characters set name = 'Novo nome' where id = $1 returning name`, [id]));
    expect(renamed).toEqual([{ name: 'Novo nome' }]);
  });

  it('mestre esconde um NPC que já existia', async () => {
    const t = await createTable();
    const npc = await createCharacter(t.gm, t.campaign, { kind: 'npc' });
    await as(t.gm, (q) => q(`update public.characters set visibility = 'gm' where id = $1`, [npc]));
    expect(await as(t.players[0]!, (q) => q('select id from public.characters where id = $1', [npc]))).toEqual([]);
  });
});

describe('operações na ficha', () => {
  it('aplica set, inc e unset e sobe a versão', async () => {
    const t = await createTable();
    const id = await createCharacter(t.players[0]!, t.campaign);
    const r = await ops(t.players[0]!, id, [
      { op: 'set', path: ['values', 'pv'], value: { atual: 20 } },
      { op: 'inc', path: ['values', 'pv', 'atual'], by: -6 },
      { op: 'set', path: ['lists', 'pericias', 'items', 'luta', 'grau'], value: 5 },
      { op: 'set', path: ['conditions'], value: ['abalado'] },
    ]);
    expect(r).toEqual({ version: 1, duplicate: false });
    const data = await dataOf(id);
    expect(data.values.pv).toEqual({ atual: 14 });
    expect(data.lists.pericias!.items.luta).toEqual({ grau: 5 });
    expect(data.conditions).toEqual(['abalado']);
    await ops(t.players[0]!, id, [{ op: 'unset', path: ['values', 'pv'] }]);
    expect((await dataOf(id)).values.pv).toBeUndefined();
  });

  it('dá o mesmo resultado que applyOps do motor', async () => {
    const t = await createTable();
    const start: CharacterData = { values: { nex: 5, pv: { atual: 3, temp: 1 } }, lists: {}, conditions: [] };
    const id = await createCharacter(t.players[0]!, t.campaign, { data: start });
    const list: CharacterOp[] = [
      { op: 'inc', path: ['values', 'nex'], by: 5 },
      { op: 'inc', path: ['values', 'novo'], by: 2.5 },
      { op: 'set', path: ['values', 'pv', 'temp'], value: 0 },
      { op: 'set', path: ['values', 'texto'], value: 'olá "mundo"' },
      { op: 'set', path: ['lists', 'ataques'], value: { order: ['a'], items: { a: { nome: 'Faca', dano: '1d4' } } } },
      { op: 'set', path: ['lists', 'ataques', 'items', 'a', 'dano'], value: '1d6' },
      { op: 'unset', path: ['values', 'pv', 'atual'] },
      { op: 'set', path: ['values', 'nex', 'quebrado'], value: 1 },
    ];
    await ops(t.players[0]!, id, list);
    expect(await dataOf(id)).toEqual(applyOps(start, list));
  });

  it('reenviar o mesmo lote não aplica de novo (fila offline)', async () => {
    const t = await createTable();
    const id = await createCharacter(t.players[0]!, t.campaign, { data: { values: { pv: { atual: 10 } }, lists: {}, conditions: [] } });
    const opId = randomUUID();
    const batch: CharacterOp[] = [{ op: 'inc', path: ['values', 'pv', 'atual'], by: -3 }];
    expect(await ops(t.players[0]!, id, batch, opId)).toEqual({ version: 1, duplicate: false });
    expect(await ops(t.players[0]!, id, batch, opId)).toEqual({ version: 1, duplicate: true });
    expect((await dataOf(id)).values.pv).toEqual({ atual: 7 });
  });

  it('dois danos simultâneos somam (inc) em vez de um apagar o outro', async () => {
    const t = await createTable();
    const id = await createCharacter(t.players[0]!, t.campaign, { data: { values: { pv: { atual: 30 } }, lists: {}, conditions: [] } });
    await Promise.all([
      ops(t.players[0]!, id, [{ op: 'inc', path: ['values', 'pv', 'atual'], by: -5 }]),
      ops(t.gm, id, [{ op: 'inc', path: ['values', 'pv', 'atual'], by: -8 }]),
    ]);
    expect((await dataOf(id)).values.pv).toEqual({ atual: 17 });
  });

  it('mestre edita a ficha do jogador; outro jogador e quem é de fora não', async () => {
    const t = await createTable();
    const id = await createCharacter(t.players[0]!, t.campaign);
    await ops(t.gm, id, [{ op: 'set', path: ['values', 'nex'], value: 10 }]);
    await expectPgError(ops(t.players[1]!, id, [{ op: 'set', path: ['values', 'nex'], value: 99 }]), '42501');
    await expectPgError(ops(t.outsider, id, [{ op: 'set', path: ['values', 'nex'], value: 99 }]), '42501');
    expect((await dataOf(id)).values.nex).toBe(10);
  });

  it('recusa caminhos fora da ficha e lotes inválidos', async () => {
    const t = await createTable();
    const id = await createCharacter(t.players[0]!, t.campaign);
    await expectPgError(ops(t.players[0]!, id, [{ op: 'set', path: ['owner'], value: 1 }]), '22023');
    await expectPgError(ops(t.players[0]!, id, []), '22023');
    await expectPgError(ops(t.players[0]!, id, [{ op: 'apagar', path: ['values', 'x'] } as unknown as CharacterOp]), '22023');
  });

  it('histórico com valor antigo e novo: visível ao dono e ao mestre, não aos outros', async () => {
    const t = await createTable();
    const id = await createCharacter(t.players[0]!, t.campaign, { data: { values: { nex: 5 }, lists: {}, conditions: [] } });
    await ops(t.gm, id, [{ op: 'set', path: ['values', 'nex'], value: 10 }]);
    const sql = 'select op, path, old_value, new_value, user_id from public.character_changes where character_id = $1';
    const mine = await as(t.players[0]!, (q) => q(sql, [id]));
    expect(mine).toEqual([{ op: 'set', path: ['values', 'nex'], old_value: 5, new_value: 10, user_id: t.gm }]);
    expect(await as(t.gm, (q) => q(sql, [id]))).toHaveLength(1);
    expect(await as(t.players[1]!, (q) => q(sql, [id]))).toEqual([]);
  });
});

describe('itens e loot', () => {
  it('jogador mexe só no inventário dos próprios personagens', async () => {
    const t = await createTable();
    const mine = await createCharacter(t.players[0]!, t.campaign);
    const other = await createCharacter(t.players[1]!, t.campaign);
    const insert = `insert into public.items (campaign_id, holder_type, holder_id, name) values ($1, 'character', $2, 'Lanterna') returning id`;
    const [item] = await as(t.players[0]!, (q) => q<{ id: string }>(insert, [t.campaign, mine]));
    await expectPgError(as(t.players[0]!, (q) => q(insert, [t.campaign, other])), '42501');
    const upd = await as(t.players[1]!, (q) => q(`update public.items set quantity = 9 where id = $1 returning id`, [item!.id]));
    expect(upd).toEqual([]);
    await expectPgError(as(t.players[0]!, (q) => q(`update public.items set holder_id = $2 where id = $1`, [item!.id, other])), '42501');
  });

  it('item não identificado: jogador vê a versão falsa; o segredo só o mestre lê', async () => {
    const t = await createTable();
    const pc = await createCharacter(t.players[0]!, t.campaign);
    const [item] = await as(t.gm, (q) =>
      q<{ id: string }>(
        `insert into public.items (campaign_id, holder_type, holder_id, name, identified) values ($1, 'character', $2, 'Anel estranho', false) returning id`,
        [t.campaign, pc],
      ),
    );
    await as(t.gm, (q) => q(`insert into public.item_secrets (item_id, real_name, real_description) values ($1, 'Anel do Medo', 'Amaldiçoado')`, [item!.id]));
    const seen = await as(t.players[0]!, (q) => q('select name from public.items where id = $1', [item!.id]));
    expect(seen).toEqual([{ name: 'Anel estranho' }]);
    expect(await as(t.players[0]!, (q) => q('select * from public.item_secrets'))).toEqual([]);
    await expectPgError(as(t.players[0]!, (q) => q('update public.items set identified = true where id = $1', [item!.id])), '42501');
    expect(await as(t.gm, (q) => q('select real_name from public.item_secrets where item_id = $1', [item!.id]))).toEqual([{ real_name: 'Anel do Medo' }]);
  });

  it('baú fica escondido até o mestre revelar', async () => {
    const t = await createTable();
    const [pool_] = await as(t.gm, (q) => q<{ id: string }>(`insert into public.loot_pools (campaign_id, name) values ($1, 'Cofre') returning id`, [t.campaign]));
    await as(t.gm, (q) => q(`insert into public.items (campaign_id, holder_type, holder_id, name) values ($1, 'loot', $2, 'Pistola')`, [t.campaign, pool_!.id]));
    expect(await as(t.players[0]!, (q) => q(`select name from public.items where holder_type = 'loot'`))).toEqual([]);
    await as(t.gm, (q) => q('update public.loot_pools set revealed = true where id = $1', [pool_!.id]));
    expect(await as(t.players[0]!, (q) => q(`select name from public.items where holder_type = 'loot'`))).toEqual([{ name: 'Pistola' }]);
  });

  it('item da biblioteca do mestre é invisível aos jogadores', async () => {
    const t = await createTable();
    await as(t.gm, (q) => q(`insert into public.items (campaign_id, holder_type, name) values ($1, 'library', 'Faca ritualística')`, [t.campaign]));
    expect(await as(t.players[0]!, (q) => q(`select name from public.items`))).toEqual([]);
  });

  it('item não pode apontar para personagem de outra mesa', async () => {
    const a = await createTable();
    const b = await createTable();
    const pcB = await createCharacter(b.gm, b.campaign);
    await expectPgError(
      as(a.gm, (q) => q(`insert into public.items (campaign_id, holder_type, holder_id, name) values ($1, 'character', $2, 'X')`, [a.campaign, pcB])),
      '23514',
    );
  });
});

describe('rolagens', () => {
  it('pública para todos, secreta só para o mestre, "só para o mestre" para autor e mestre', async () => {
    const t = await createTable();
    const insert = `insert into public.rolls (campaign_id, user_id, label, expression, result, total, visibility) values ($1, $2, $3, '1d20', '{}', 10, $4)`;
    await asService(async (q) => {
      await q(insert, [t.campaign, t.players[0], 'Percepção', 'public']);
      await q(insert, [t.campaign, t.gm, 'Emboscada', 'gm']);
      await q(insert, [t.campaign, t.players[0], 'Intuição', 'self_gm']);
    });
    const labels = async (uid: string) => (await as(uid, (q) => q<{ label: string }>('select label from public.rolls order by label'))).map((r) => r.label);
    expect(await labels(t.gm)).toEqual(['Emboscada', 'Intuição', 'Percepção']);
    expect(await labels(t.players[0]!)).toEqual(['Intuição', 'Percepção']);
    expect(await labels(t.players[1]!)).toEqual(['Percepção']);
    expect(await labels(t.outsider)).toEqual([]);
  });

  it('ninguém insere rolagem direto, nem o mestre', async () => {
    const t = await createTable();
    await expectPgError(
      as(t.gm, (q) => q(`insert into public.rolls (campaign_id, label, expression, result, total) values ($1, 'x', '1d20', '{}', 20)`, [t.campaign])),
      '42501',
    );
  });
});

describe('handouts e notas', () => {
  it('handout aparece só depois de revelado, e só para os destinatários', async () => {
    const t = await createTable();
    const [h] = await as(t.gm, (q) => q<{ id: string }>(`insert into public.handouts (campaign_id, title, body) values ($1, 'Carta', 'Segredo') returning id`, [t.campaign]));
    const sees = async (uid: string) => (await as(uid, (q) => q('select id from public.handouts'))).length;
    expect(await sees(t.players[0]!)).toBe(0);
    await as(t.gm, (q) => q('insert into public.handout_recipients (handout_id, user_id) values ($1, $2)', [h!.id, t.players[0]]));
    expect(await sees(t.players[0]!)).toBe(1);
    expect(await sees(t.players[1]!)).toBe(0);
    await as(t.gm, (q) => q('update public.handouts set revealed_to_all = true where id = $1', [h!.id]));
    expect(await sees(t.players[1]!)).toBe(1);
    expect(await sees(t.outsider)).toBe(0);
  });

  it('notas privadas, para o mestre e públicas', async () => {
    const t = await createTable();
    const insert = `insert into public.notes (campaign_id, author_id, title, visibility) values ($1, $2, $3, $4)`;
    await as(t.players[0]!, async (q) => {
      await q(insert, [t.campaign, t.players[0], 'Diário da Ana', 'private']);
      await q(insert, [t.campaign, t.players[0], 'Suspeita sobre o NPC', 'gm']);
      await q(insert, [t.campaign, t.players[0], 'Mapa do porão', 'public']);
    });
    await as(t.gm, (q) => q(insert, [t.campaign, t.gm, 'Plano do vilão', 'gm']));
    const titles = async (uid: string) => (await as(uid, (q) => q<{ title: string }>('select title from public.notes order by title'))).map((r) => r.title);
    expect(await titles(t.players[0]!)).toEqual(['Diário da Ana', 'Mapa do porão', 'Suspeita sobre o NPC']);
    expect(await titles(t.players[1]!)).toEqual(['Mapa do porão']);
    expect(await titles(t.gm)).toEqual(['Mapa do porão', 'Plano do vilão', 'Suspeita sobre o NPC']);
  });

  it('busca de notas em português encontra flexões da palavra', async () => {
    const t = await createTable();
    await as(t.gm, (q) => q(`insert into public.notes (campaign_id, author_id, title, body, tags, visibility) values ($1, $2, 'Sessão 3', 'Os agentes investigaram a mansão', '{cultistas}', 'public')`, [t.campaign, t.gm]));
    const hits = await as(t.players[0]!, (q) => q(`select title from public.notes where search @@ plainto_tsquery('portuguese', 'investigar mansão cultista')`));
    expect(hits).toEqual([{ title: 'Sessão 3' }]);
  });
});

describe('combate', () => {
  it('combate em preparação é invisível; iniciado mostra combatentes não ocultos; PV de inimigo é segredo', async () => {
    const t = await createTable();
    const [enc] = await as(t.gm, (q) => q<{ id: string }>(`insert into public.encounters (campaign_id, name) values ($1, 'Galpão') returning id`, [t.campaign]));
    const [goblin] = await as(t.gm, (q) =>
      q<{ id: string }>(`insert into public.combatants (encounter_id, campaign_id, label, initiative, public_status) values ($1, $2, 'Zumbi 1', 12, 'ferido') returning id`, [enc!.id, t.campaign]),
    );
    await as(t.gm, (q) => q(`insert into public.combatants (encounter_id, campaign_id, label, hidden) values ($1, $2, 'Emboscada', true)`, [enc!.id, t.campaign]));
    await as(t.gm, (q) => q(`insert into public.combatant_secrets (combatant_id, resources) values ($1, '{"pv": {"atual": 7, "max": 20}}')`, [goblin!.id]));

    const view = async (uid: string) => as(uid, (q) => q<{ label: string; public_status: string }>('select label, public_status from public.combatants order by label'));
    expect(await view(t.players[0]!)).toEqual([]);
    await as(t.gm, (q) => q(`update public.encounters set status = 'active', round = 1 where id = $1`, [enc!.id]));
    expect(await view(t.players[0]!)).toEqual([{ label: 'Zumbi 1', public_status: 'ferido' }]);
    expect(await view(t.gm)).toHaveLength(2);
    expect(await as(t.players[0]!, (q) => q('select * from public.combatant_secrets'))).toEqual([]);
    expect(await as(t.gm, (q) => q('select resources from public.combatant_secrets'))).toEqual([{ resources: { pv: { atual: 7, max: 20 } } }]);
  });

  it('jogador não mexe no combate', async () => {
    const t = await createTable();
    await expectPgError(as(t.players[0]!, (q) => q(`insert into public.encounters (campaign_id) values ($1)`, [t.campaign])), '42501');
  });
});

describe('arquivos', () => {
  it('retrato só entra na pasta de uma mesa da qual a pessoa é membro', async () => {
    const t = await createTable();
    const other = await createTable();
    const insert = `insert into storage.objects (bucket_id, name, owner) values ('portraits', $1, $2)`;
    await as(t.players[0]!, (q) => q(insert, [`${t.campaign}/elena.webp`, t.players[0]]));
    await expectPgError(as(t.players[0]!, (q) => q(insert, [`${other.campaign}/x.webp`, t.players[0]])), '42501');
    await expectPgError(as(t.players[0]!, (q) => q(insert, ['sem-pasta.webp', t.players[0]])), '42501');
    expect(await as(t.players[1]!, (q) => q(`select name from storage.objects where bucket_id = 'portraits'`))).toEqual([{ name: `${t.campaign}/elena.webp` }]);
    expect(await as(other.gm, (q) => q(`select name from storage.objects where bucket_id = 'portraits'`))).toEqual([]);
  });

  it('imagem de handout só aparece para quem vê o handout', async () => {
    const t = await createTable();
    const path = `${t.campaign}/mapa.webp`;
    await as(t.gm, (q) => q(`insert into storage.objects (bucket_id, name, owner) values ('handouts', $1, $2)`, [path, t.gm]));
    const [h] = await as(t.gm, (q) => q<{ id: string }>(`insert into public.handouts (campaign_id, title, image_path) values ($1, 'Mapa', $2) returning id`, [t.campaign, path]));
    const sees = async () => (await as(t.players[0]!, (q) => q(`select name from storage.objects where bucket_id = 'handouts'`))).length;
    expect(await sees()).toBe(0);
    await as(t.gm, (q) => q('update public.handouts set revealed_to_all = true where id = $1', [h!.id]));
    expect(await sees()).toBe(1);
    await expectPgError(as(t.players[0]!, (q) => q(`insert into storage.objects (bucket_id, name) values ('handouts', $1)`, [`${t.campaign}/falso.webp`])), '42501');
  });
});
