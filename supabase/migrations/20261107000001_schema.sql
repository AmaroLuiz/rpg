-- Esquema do banco. Ver "Modelo de dados" no documento de arquitetura.
-- Tudo que é da mesa carrega campaign_id, para RLS e para filtrar o tempo real.

create schema if not exists private;

-- ---------- tipos ----------

create type public.member_role as enum ('gm', 'player');
create type public.character_kind as enum ('pc', 'npc', 'monster');
create type public.character_status as enum ('draft', 'active', 'archived');
create type public.character_visibility as enum ('public', 'gm');
create type public.note_visibility as enum ('private', 'gm', 'public');
create type public.roll_visibility as enum ('public', 'gm', 'self_gm');
create type public.holder_type as enum ('character', 'loot', 'library', 'party');
create type public.encounter_status as enum ('prep', 'active', 'ended');
create type public.loot_mode as enum ('distribute', 'free_pick');

-- ---------- utilidades ----------

-- array_to_string não é imutável; a coluna de busca precisa de uma versão que seja.
create or replace function private.tags_text(tags text[]) returns text
language sql immutable as $$ select coalesce(array_to_string(tags, ' '), '') $$;

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- contas e regras ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 60),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]+$'),
  name text not null,
  -- nulo = template embutido (Ordem Paranormal, Tormenta20)
  owner_id uuid references public.profiles (id) on delete set null,
  current_version int not null default 1,
  created_at timestamptz not null default now()
);

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  version int not null check (version > 0),
  schema jsonb not null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

-- ---------- mesa ----------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  description text not null default '',
  template_id uuid not null references public.templates (id),
  gm_id uuid not null references public.profiles (id),
  invite_code text not null unique,
  -- preferências da mesa (ex.: mostrar PV de inimigos como estado ou número)
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index on public.campaign_members (user_id);

-- ---------- personagens e itens ----------

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  owner_id uuid not null references public.profiles (id),
  kind public.character_kind not null default 'pc',
  template_version_id uuid not null references public.template_versions (id),
  name text not null default '',
  -- valores digitados (CharacterData do motor); nada calculado
  data jsonb not null default '{"values": {}, "lists": {}, "conditions": []}',
  portrait_path text,
  status public.character_status not null default 'draft',
  visibility public.character_visibility not null default 'public',
  -- modelo da biblioteca do mestre (NPC/monstro reutilizável)
  is_library boolean not null default false,
  -- sobe a cada operação aplicada; o app usa para saber se está atualizado
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.characters (campaign_id);
create index on public.characters (owner_id);

create table public.character_changes (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- id do lote enviado pela fila local; repetir o lote não reaplica
  op_id uuid not null,
  op_index int not null,
  user_id uuid references public.profiles (id) on delete set null,
  op text not null,
  path text[] not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now(),
  unique (op_id, op_index)
);
create index on public.character_changes (character_id, created_at desc);

create table public.loot_pools (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null,
  mode public.loot_mode not null default 'distribute',
  revealed boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.loot_pools (campaign_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  holder_type public.holder_type not null,
  -- characters.id ou loot_pools.id; nulo para biblioteca e grupo
  holder_id uuid,
  name text not null,
  description text not null default '',
  quantity numeric not null default 1 check (quantity >= 0),
  equipped boolean not null default false,
  data jsonb not null default '{}',
  modifiers jsonb not null default '[]',
  identified boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((holder_type in ('character', 'loot')) = (holder_id is not null))
);
create index on public.items (campaign_id);
create index on public.items (holder_type, holder_id);

create table public.item_secrets (
  item_id uuid primary key references public.items (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  real_name text not null,
  real_description text not null default '',
  real_modifiers jsonb not null default '[]'
);

-- ---------- combate ----------

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null default 'Combate',
  status public.encounter_status not null default 'prep',
  round int not null default 0,
  turn_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.encounters (campaign_id);

create table public.combatants (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  label text not null,
  initiative numeric,
  order_index int not null default 0,
  conditions jsonb not null default '[]',
  -- estado visível aos jogadores (ileso, ferido, muito_ferido, caido), calculado dos PV secretos
  public_status text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.combatants (encounter_id);

create table public.combatant_secrets (
  combatant_id uuid primary key references public.combatants (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- ex.: {"pv": {"atual": 7, "max": 12}}
  resources jsonb not null default '{}'
);

-- ---------- conteúdo da mesa ----------

create table public.rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  character_id uuid references public.characters (id) on delete set null,
  label text not null,
  expression text not null,
  -- RollResult do motor: dados individuais, texto, bônus
  result jsonb not null,
  total numeric not null,
  visibility public.roll_visibility not null default 'public',
  offline boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.rolls (campaign_id, created_at desc);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index on public.folders (campaign_id);

create table public.handouts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  title text not null,
  body text not null default '',
  image_path text,
  revealed_to_all boolean not null default false,
  revealed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.handouts (campaign_id);

create table public.handout_recipients (
  handout_id uuid not null references public.handouts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (handout_id, user_id)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  kind text not null default 'note' check (kind in ('note', 'session', 'npc', 'location', 'faction')),
  title text not null default '',
  body text not null default '',
  tags text[] not null default '{}',
  visibility public.note_visibility not null default 'private',
  session_date date,
  search tsvector generated always as (
    to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || private.tags_text(tags))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.notes (campaign_id);
create index on public.notes using gin (search);

-- ---------- updated_at ----------

do $$
declare t text;
begin
  foreach t in array array['profiles', 'campaigns', 'characters', 'items', 'encounters', 'handouts', 'notes'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- perfil automático no cadastro ----------

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Aventureiro'
    ), 60)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
