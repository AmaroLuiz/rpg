import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { admin, as, asAnon, createTable, createUser, expectPgError, pool } from './db.js';

afterAll(() => pool.end());

describe('contas', () => {
  it('cria o perfil no cadastro, com o nome do Google ou do e-mail', async () => {
    const id = await createUser('Dandara');
    const [p] = await admin<{ display_name: string }>('select display_name from public.profiles where id = $1', [id]);
    expect(p!.display_name).toBe('Dandara');
    const [u] = await admin<{ id: string }>(`insert into auth.users (email) values ('sem.nome@teste.dev') returning id`);
    const [p2] = await admin<{ display_name: string }>('select display_name from public.profiles where id = $1', [u!.id]);
    expect(p2!.display_name).toBe('sem.nome');
  });

  it('templates embutidos estão publicados e visíveis', async () => {
    const id = await createUser('Leitor');
    const rows = await as(id, (q) =>
      q<{ slug: string; version: number }>(
        `select t.slug, v.version from public.templates t join public.template_versions v on v.template_id = t.id order by t.slug, v.version`,
      ),
    );
    expect(rows).toEqual([
      { slug: 'ordem_paranormal', version: 1 },
      { slug: 'ordem_paranormal', version: 2 },
      { slug: 'ordem_paranormal', version: 3 },
      { slug: 'tormenta20', version: 1 },
      { slug: 'tormenta20', version: 2 },
      { slug: 'tormenta20', version: 3 },
    ]);
  });

  it('a migração dos templates está em dia com os arquivos JSON', async () => {
    for (const [slug, file] of [['ordem_paranormal', 'ordem-paranormal'], ['tormenta20', 'tormenta20']]) {
      const json = JSON.parse(readFileSync(new URL(`../../packages/templates/src/${file}.json`, import.meta.url), 'utf8'));
      const [row] = await admin<{ schema: unknown }>(
        `select v.schema from public.template_versions v join public.templates t on t.id = v.template_id where t.slug = $1 and v.version = $2`,
        [slug, json.version],
      );
      expect(row?.schema, `rode "pnpm gen:templates" (ou suba a versão de ${slug})`).toEqual(json);
    }
  });

  it('anônimo não lê nada nem chama funções', async () => {
    await expectPgError(asAnon((q) => q('select * from public.campaigns')), '42501');
    await expectPgError(asAnon((q) => q(`select public.join_campaign('ABC123')`)), '42501');
  });

  it('só vê perfis de quem joga junto', async () => {
    const t = await createTable();
    const visible = await as(t.players[0]!, (q) => q<{ id: string }>('select id from public.profiles'));
    const ids = visible.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([t.gm, t.players[0], t.players[1]]));
    expect(ids).not.toContain(t.outsider);
  });

  it('não muda o perfil de outra pessoa', async () => {
    const t = await createTable();
    const rows = await as(t.players[0]!, (q) => q(`update public.profiles set display_name = 'hack' where id = $1 returning id`, [t.gm]));
    expect(rows).toEqual([]);
  });
});

describe('mesas e convites', () => {
  it('criar mesa torna o criador mestre e gera convite de 6 caracteres', async () => {
    const t = await createTable();
    expect(t.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    const members = await as(t.gm, (q) => q<{ user_id: string; role: string }>('select user_id, role from public.campaign_members where campaign_id = $1', [t.campaign]));
    expect(members.find((m) => m.user_id === t.gm)?.role).toBe('gm');
    expect(members.filter((m) => m.role === 'player')).toHaveLength(2);
  });

  it('sistema desconhecido é recusado', async () => {
    const u = await createUser('Mestre');
    await expectPgError(as(u, (q) => q(`select public.create_campaign('X', 'gurps')`)), 'PT404');
  });

  it('entrar é idempotente e aceita código digitado com espaço ou minúscula', async () => {
    const t = await createTable();
    const messy = `${t.code.slice(0, 3).toLowerCase()} ${t.code.slice(3)}`;
    const [r] = await as(t.players[0]!, (q) => q<{ join_campaign: string }>('select public.join_campaign($1)', [messy]));
    expect(r!.join_campaign).toBe(t.campaign);
    const [{ n }] = (await admin<{ n: string }>('select count(*) n from public.campaign_members where campaign_id = $1', [t.campaign])) as [{ n: string }];
    expect(Number(n)).toBe(3);
  });

  it('código inválido dá erro claro', async () => {
    const u = await createUser('Perdido');
    await expectPgError(as(u, (q) => q(`select public.join_campaign('ZZZZZZ')`)), 'PT404');
  });

  it('quem não é membro não vê a mesa', async () => {
    const t = await createTable();
    const rows = await as(t.outsider, (q) => q('select id from public.campaigns where id = $1', [t.campaign]));
    expect(rows).toEqual([]);
  });

  it('jogador não edita a mesa nem troca o convite; mestre sim', async () => {
    const t = await createTable();
    const none = await as(t.players[0]!, (q) => q(`update public.campaigns set name = 'hack' where id = $1 returning id`, [t.campaign]));
    expect(none).toEqual([]);
    await expectPgError(as(t.players[0]!, (q) => q('select public.regenerate_invite_code($1)', [t.campaign])), '42501');
    const [r] = await as(t.gm, (q) => q<{ regenerate_invite_code: string }>('select public.regenerate_invite_code($1)', [t.campaign]));
    expect(r!.regenerate_invite_code).not.toBe(t.code);
  });

  it('mestre não pode trocar o dono da mesa nem o convite direto', async () => {
    const t = await createTable();
    await expectPgError(as(t.gm, (q) => q(`update public.campaigns set gm_id = $2 where id = $1`, [t.campaign, t.players[0]])), '42501');
    await expectPgError(as(t.gm, (q) => q(`update public.campaigns set invite_code = 'AAAAAA' where id = $1`, [t.campaign])), '42501');
  });

  it('jogador sai; mestre remove jogador; ninguém remove o mestre', async () => {
    const t = await createTable();
    const left = await as(t.players[0]!, (q) => q('delete from public.campaign_members where campaign_id = $1 and user_id = $2 returning user_id', [t.campaign, t.players[0]]));
    expect(left).toHaveLength(1);
    const kicked = await as(t.gm, (q) => q('delete from public.campaign_members where campaign_id = $1 and user_id = $2 returning user_id', [t.campaign, t.players[1]]));
    expect(kicked).toHaveLength(1);
    const self = await as(t.gm, (q) => q('delete from public.campaign_members where campaign_id = $1 and user_id = $2 returning user_id', [t.campaign, t.gm]));
    expect(self).toEqual([]);
  });

  it('jogador não remove outro jogador', async () => {
    const t = await createTable();
    const rows = await as(t.players[0]!, (q) => q('delete from public.campaign_members where campaign_id = $1 and user_id = $2 returning user_id', [t.campaign, t.players[1]]));
    expect(rows).toEqual([]);
  });
});
