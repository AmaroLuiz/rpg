// Gera a migração que publica os templates embutidos no banco.
// Uso: node scripts/gen-template-migration.mjs [arquivo-de-saída]
// Uma versão nova de template = rode de novo com um nome de arquivo novo; versões já publicadas não mudam.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dir = join(root, 'packages/templates/src');
const out = process.argv[2] ?? join(root, 'supabase/migrations/20261107000004_builtin_templates.sql');
const DELIM = '$tpl$';

const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
let sql = '-- Gerado por scripts/gen-template-migration.mjs. Não edite à mão.\n';
for (const f of files) {
  const t = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const json = JSON.stringify(t);
  if (json.includes(DELIM)) throw new Error(`${f} contém o delimitador ${DELIM}`);
  const name = t.name.replaceAll("'", "''");
  sql += `
-- ${t.name} v${t.version}
insert into public.templates (slug, name, owner_id, current_version)
values ('${t.id}', '${name}', null, ${t.version})
on conflict (slug) do update set name = excluded.name, current_version = greatest(public.templates.current_version, excluded.current_version);

insert into public.template_versions (template_id, version, schema)
select id, ${t.version}, ${DELIM}${json}${DELIM}::jsonb from public.templates where slug = '${t.id}'
on conflict (template_id, version) do nothing;
`;
}
writeFileSync(out, sql);
console.log(`${files.length} template(s) -> ${out}`);
