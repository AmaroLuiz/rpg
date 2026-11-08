-- M8: mapas com grid quadrado, tokens ligados às fichas, névoa de guerra e marcas (desenho, alfinete, área).
-- O mestre prepara vários mapas e põe um "na mesa" (ativo); jogadores veem só os revelados.

-- ---------- tabelas ----------

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  -- imagem de fundo no bucket "maps"; nulo = fundo liso só com o grid
  image_path text,
  -- tamanho da imagem em pixels (sem imagem: cols*cell_px × rows*cell_px)
  image_w int not null default 0 check (image_w >= 0),
  image_h int not null default 0 check (image_h >= 0),
  -- grid em pixels da imagem: lado da célula e onde começa a primeira
  cell_px numeric not null default 70 check (cell_px between 8 and 1000),
  offset_x numeric not null default 0,
  offset_y numeric not null default 0,
  cols int not null default 20 check (cols between 1 and 100),
  rows int not null default 15 check (rows between 1 and 100),
  cell_meters numeric not null default 1.5 check (cell_meters > 0),
  -- régua: 'alternate' = diagonais alternam 1 e 2 quadrados; 'equal' = diagonal vale 1
  diagonal text not null default 'alternate' check (diagonal in ('alternate', 'equal')),
  revealed boolean not null default false,
  active boolean not null default false,
  fog_enabled boolean not null default false,
  -- uma posição por célula (linha a linha): '1' revelada, '0' ou ausente = escondida
  fog text not null default '' check (fog ~ '^[01]*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.maps (campaign_id);
create unique index maps_one_active on public.maps (campaign_id) where active;

create table public.map_tokens (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  combatant_id uuid references public.combatants (id) on delete set null,
  label text not null check (length(label) between 1 and 100),
  -- célula do canto superior esquerdo; o token ocupa size × size células
  x int not null default 0 check (x >= 0),
  y int not null default 0 check (y >= 0),
  size int not null default 1 check (size between 1 and 4),
  color text not null default '#9a5a0c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.map_tokens (map_id);
create index on public.map_tokens (campaign_id);

create table public.map_marks (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- draw: {points: [[x,y],...], width} em pixels da imagem
  -- pin:  {x, y, text} em pixels da imagem
  -- area: {shape: circle|cone|line, origin: {x,y}, target: {x,y}, size_m} em unidades de célula
  kind text not null check (kind in ('draw', 'pin', 'area')),
  data jsonb not null default '{}' check (pg_column_size(data) < 64000),
  color text not null default '#e8a33d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  gm_only boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.map_marks (map_id);
create index on public.map_marks (campaign_id);

create trigger touch_updated_at before update on public.maps for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.map_tokens for each row execute function private.touch_updated_at();

-- ---------- regras que RLS sozinho não expressa ----------

-- Mapa ativo é sempre revelado; esconder o mapa tira ele da mesa.
create or replace function private.guard_maps() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.active and not new.revealed then
    if tg_op = 'UPDATE' and old.revealed and not new.revealed then
      new.active := false;
    else
      new.revealed := true;
    end if;
  end if;
  return new;
end $$;

create trigger guard_maps before insert or update on public.maps
  for each row execute function private.guard_maps();

-- Tokens e marcas herdam a mesa do mapa.
create or replace function private.inherit_map_campaign() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select campaign_id into new.campaign_id from public.maps where id = new.map_id;
  if new.campaign_id is null then
    raise exception 'Mapa não encontrado' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger inherit_campaign before insert on public.map_tokens for each row execute function private.inherit_map_campaign();
create trigger inherit_campaign before insert on public.map_marks for each row execute function private.inherit_map_campaign();

-- Token dentro do grid, ligado a ficha/combatente da mesma mesa; jogador só muda a posição.
create or replace function private.guard_map_tokens() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.maps;
begin
  select * into m from public.maps where id = new.map_id;
  if new.x + new.size > m.cols or new.y + new.size > m.rows then
    raise exception 'O token ficaria fora do mapa' using errcode = '22023';
  end if;
  if new.character_id is not null
    and not exists (select 1 from public.characters c where c.id = new.character_id and c.campaign_id = m.campaign_id) then
    raise exception 'Personagem não encontrado nesta mesa' using errcode = 'PT404';
  end if;
  if new.combatant_id is not null
    and not exists (select 1 from public.combatants c where c.id = new.combatant_id and c.campaign_id = m.campaign_id) then
    raise exception 'Combatente não encontrado nesta mesa' using errcode = 'PT404';
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and not private.is_gm(old.campaign_id)
    and (new.label, new.size, new.color, new.hidden, new.character_id, new.combatant_id, new.map_id)
      is distinct from (old.label, old.size, old.color, old.hidden, old.character_id, old.combatant_id, old.map_id) then
    raise exception 'Você só pode mover o seu token' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger guard_map_tokens before insert or update on public.map_tokens
  for each row execute function private.guard_map_tokens();

-- Visível pela névoa: névoa desligada, ou alguma célula coberta pelo token está revelada.
create or replace function private.token_visible(p_map uuid, p_x int, p_y int, p_size int) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select not m.fog_enabled or exists (
      select 1
      from generate_series(0, p_size - 1) dx, generate_series(0, p_size - 1) dy
      where p_x + dx < m.cols
        and substr(m.fog, (p_y + dy) * m.cols + (p_x + dx) + 1, 1) = '1'
    )
    from public.maps m where m.id = p_map
  ), false)
$$;

/*
  O tempo real não avisa quem deixou de poder ver uma linha (token entrou na névoa, foi escondido
  ou apagado). Nesses casos o mapa é "tocado" e todos releem.
*/
create or replace function private.touch_map_from_token() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.maps set updated_at = now() where id = old.map_id;
  elsif old.hidden is distinct from new.hidden
    or private.token_visible(old.map_id, old.x, old.y, old.size) is distinct from private.token_visible(new.map_id, new.x, new.y, new.size) then
    update public.maps set updated_at = now() where id = new.map_id;
  end if;
  return null;
end $$;

create trigger touch_map after update of x, y, size, hidden or delete on public.map_tokens
  for each row execute function private.touch_map_from_token();

create or replace function private.touch_map() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.maps set updated_at = now() where id = old.map_id;
  return null;
end $$;

create trigger touch_map after delete on public.map_marks
  for each row execute function private.touch_map();

-- ---------- mapa na mesa ----------

-- Põe um mapa na mesa (e tira o anterior). p_map nulo tira o mapa atual.
create or replace function public.set_active_map(p_campaign uuid, p_map uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  if not private.is_gm(p_campaign) then
    raise exception 'Só o mestre escolhe o mapa da mesa' using errcode = '42501';
  end if;
  if p_map is not null and not exists (select 1 from public.maps where id = p_map and campaign_id = p_campaign) then
    raise exception 'Mapa não encontrado nesta mesa' using errcode = 'PT404';
  end if;
  update public.maps set active = false where campaign_id = p_campaign and active and id is distinct from p_map;
  if p_map is not null then
    update public.maps set active = true, revealed = true where id = p_map;
  end if;
end $$;

revoke execute on function public.set_active_map(uuid, uuid) from public, anon;
grant execute on function public.set_active_map(uuid, uuid) to authenticated;

-- ---------- privilégios ----------

revoke all on public.maps, public.map_tokens, public.map_marks from anon;
revoke update on public.maps, public.map_tokens, public.map_marks from authenticated;
-- active muda só por set_active_map (um ativo por mesa)
grant update (name, image_path, image_w, image_h, cell_px, offset_x, offset_y, cols, rows, cell_meters, diagonal, revealed, fog_enabled, fog)
  on public.maps to authenticated;
grant update (label, x, y, size, color, hidden, character_id, combatant_id) on public.map_tokens to authenticated;

-- ---------- RLS ----------

alter table public.maps enable row level security;
alter table public.map_tokens enable row level security;
alter table public.map_marks enable row level security;

create policy "ver mapa revelado" on public.maps for select to authenticated
  using (private.is_gm(campaign_id) or (revealed and private.is_member(campaign_id)));
create policy "mestre controla mapas" on public.maps for all to authenticated
  using (private.is_gm(campaign_id)) with check (private.is_gm(campaign_id));

-- A subconsulta em maps e combatants respeita o RLS de quem lê.
create policy "ver tokens" on public.map_tokens for select to authenticated
  using (
    private.is_gm(campaign_id)
    or (
      not hidden
      and exists (select 1 from public.maps m where m.id = map_id)
      and (
        private.owns_character(character_id)
        or (
          (combatant_id is null or exists (select 1 from public.combatants c where c.id = combatant_id))
          and private.token_visible(map_id, x, y, size)
        )
      )
    )
  );
create policy "mestre põe tokens" on public.map_tokens for insert to authenticated with check (private.is_gm(campaign_id));
create policy "mestre tira tokens" on public.map_tokens for delete to authenticated using (private.is_gm(campaign_id));
create policy "mover token" on public.map_tokens for update to authenticated
  using (private.is_gm(campaign_id) or private.owns_character(character_id))
  with check (private.is_gm(campaign_id) or private.owns_character(character_id));

create policy "ver marcas" on public.map_marks for select to authenticated
  using (private.is_gm(campaign_id) or (not gm_only and exists (select 1 from public.maps m where m.id = map_id)));
create policy "marcar no mapa" on public.map_marks for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.maps m where m.id = map_id)
    and (not gm_only or private.is_gm(campaign_id))
  );
create policy "apagar marca" on public.map_marks for delete to authenticated
  using (author_id = auth.uid() or private.is_gm(campaign_id));

-- ---------- Storage: imagens dos mapas ----------

insert into storage.buckets (id, name, public) values ('maps', 'maps', false) on conflict (id) do nothing;

create policy "mapas: quem vê o mapa vê a imagem" on storage.objects for select to authenticated
  using (
    bucket_id = 'maps'
    and (
      private.is_gm(private.try_uuid((storage.foldername(name))[1]))
      or exists (select 1 from public.maps m where m.image_path = objects.name)
    )
  );
create policy "mapas: mestre envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'maps' and private.is_gm(private.try_uuid((storage.foldername(name))[1])));
create policy "mapas: mestre apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'maps' and private.is_gm(private.try_uuid((storage.foldername(name))[1])));

-- ---------- tempo real ----------

alter publication supabase_realtime add table public.maps, public.map_tokens, public.map_marks;
