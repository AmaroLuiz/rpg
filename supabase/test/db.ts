import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

export const pool = new pg.Pool({ connectionString: inject('dbUrl'), max: 4 });

export type Q = <T extends pg.QueryResultRow = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<T[]>;

/** Executa como um papel do Supabase, numa transação: usuário logado, anônimo ou chave de serviço. */
async function run<T>(role: 'authenticated' | 'anon' | 'service_role', uid: string | null, fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid ?? '', role })]);
    await client.query(`set local role ${role}`);
    const q: Q = async (text, values) => (await client.query(text, values)).rows;
    const result = await fn(q);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export const as = <T>(uid: string, fn: (q: Q) => Promise<T>) => run('authenticated', uid, fn);
export const asAnon = <T>(fn: (q: Q) => Promise<T>) => run('anon', null, fn);
export const asService = <T>(fn: (q: Q) => Promise<T>) => run('service_role', null, fn);

/** Consulta como superusuário (preparação de cenário, sem RLS). */
export async function admin<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]> {
  return (await pool.query<T>(text, values)).rows;
}

export async function createUser(name: string): Promise<string> {
  const [row] = await admin<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [`${name.toLowerCase()}-${randomUUID().slice(0, 8)}@teste.dev`, { full_name: name }],
  );
  return row!.id;
}

export interface Table {
  campaign: string;
  code: string;
  gm: string;
  players: string[];
  outsider: string;
}

/** Cenário padrão: uma mesa de Ordem Paranormal com mestre, dois jogadores e alguém de fora. */
export async function createTable(template = 'ordem_paranormal'): Promise<Table> {
  const gm = await createUser('Mestre');
  const p1 = await createUser('Ana');
  const p2 = await createUser('Bruno');
  const outsider = await createUser('Carla');
  const [c] = await as(gm, (q) => q<{ id: string; invite_code: string }>(`select * from public.create_campaign('Mesa de teste', $1)`, [template]));
  for (const p of [p1, p2]) await as(p, (q) => q(`select public.join_campaign($1)`, [c!.invite_code]));
  return { campaign: c!.id, code: c!.invite_code, gm, players: [p1, p2], outsider };
}

export async function createCharacter(uid: string, campaign: string, opts: { name?: string; kind?: string; visibility?: string; data?: unknown } = {}) {
  const [row] = await as(uid, (q) =>
    q<{ id: string }>(`select id from public.create_character($1, $2, $3, $4::public.character_kind, $5::public.character_visibility)`, [
      campaign,
      opts.name ?? 'Personagem',
      JSON.stringify(opts.data ?? { values: {}, lists: {}, conditions: [] }),
      opts.kind ?? 'pc',
      opts.visibility ?? 'public',
    ]),
  );
  return row!.id;
}

export async function expectPgError(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === code) return;
    throw new Error(`Esperava erro ${code}, veio ${err.code}: ${err.message}`);
  }
  throw new Error(`Esperava erro ${code}, mas deu certo`);
}
