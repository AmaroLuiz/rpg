/**
 * Sobe um Postgres temporário para os testes do banco, aplica a camada que imita o Supabase
 * e todas as migrações em ordem. Com TEST_DATABASE_URL definido, usa esse banco (que deve
 * estar vazio, ex.: o Postgres do `supabase start` com um banco novo).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

const root = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 54329;

function pgBin(name: string): string {
  for (const v of ['17', '16', '15']) {
    const p = `/usr/lib/postgresql/${v}/bin/${name}`;
    if (existsSync(p)) return p;
  }
  return name;
}

function asPostgres(cmd: string, args: string[]) {
  // O Postgres não roda como root; no container usamos o usuário "postgres".
  if (process.getuid?.() === 0) execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' });
  else execFileSync(cmd, args, { stdio: 'pipe' });
}

export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  let cleanup = async () => {};

  if (!url) {
    const dir = mkdtempSync(join(tmpdir(), 'rpg-pg-'));
    chmodSync(dir, 0o777);
    const data = join(dir, 'data');
    asPostgres(pgBin('initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8']);
    asPostgres(pgBin('pg_ctl'), [
      '-D', data, '-l', join(dir, 'log'), '-w', 'start',
      '-o', `-p ${PORT} -k ${dir} -c listen_addresses='' -c fsync=off -c full_page_writes=off`,
    ]);
    url = `postgresql://postgres@/postgres?host=${encodeURIComponent(dir)}&port=${PORT}`;
    cleanup = async () => {
      try {
        asPostgres(pgBin('pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(join(root, 'supabase/test/supabase-shim.sql'), 'utf8'));
    const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const f of migrations) {
      try {
        await client.query(readFileSync(join(root, 'supabase/migrations', f), 'utf8'));
      } catch (e) {
        throw new Error(`Migração ${f} falhou: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }

  project.provide('dbUrl', url);
  return cleanup;
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}
