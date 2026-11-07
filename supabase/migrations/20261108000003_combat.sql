-- M5: combate. Estado público dos inimigos, combatentes numerados, iniciativa e turnos.

-- ---------- estado público a partir do PV secreto ----------

-- ileso (cheio), ferido (mais da metade), muito_ferido (metade ou menos), caido (0 ou menos).
create or replace function private.public_status(resources jsonb) returns text
language plpgsql immutable as $$
declare
  atual numeric := (resources -> 'pv' ->> 'atual')::numeric;
  maximo numeric := (resources -> 'pv' ->> 'max')::numeric;
begin
  if atual is null or maximo is null or maximo <= 0 then
    return null;
  end if;
  if atual <= 0 then return 'caido'; end if;
  if atual >= maximo then return 'ileso'; end if;
  if atual * 2 > maximo then return 'ferido'; end if;
  return 'muito_ferido';
end $$;

-- Copia o estado (nunca o número) para combatants, que os jogadores leem.
-- settings.enemy_hp = 'hidden' na mesa esconde até o estado.
create or replace function private.sync_public_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  mode text;
begin
  select coalesce(c.settings ->> 'enemy_hp', 'status') into mode from public.campaigns c where c.id = new.campaign_id;
  update public.combatants
  set public_status = case when mode = 'hidden' then null else private.public_status(new.resources) end
  where id = new.combatant_id;
  return new;
end $$;

create trigger sync_public_status after insert or update of resources on public.combatant_secrets
  for each row execute function private.sync_public_status();

-- Esconder ou tirar um combatente some com a linha para os jogadores, e o tempo real não avisa
-- quem deixou de poder ver. Mexer no combate em si avisa todo mundo para reler a lista.
create or replace function private.touch_encounter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.encounters set updated_at = now() where id = coalesce(new.encounter_id, old.encounter_id);
  return null;
end $$;

create trigger touch_encounter_on_hide after update of hidden on public.combatants
  for each row when (old.hidden is distinct from new.hidden) execute function private.touch_encounter();
create trigger touch_encounter_on_delete after delete on public.combatants
  for each row execute function private.touch_encounter();

-- ---------- adicionar combatentes ----------

/*
  Adiciona um personagem ao combate, p_count vezes. NPCs e monstros ganham nomes numerados
  ("Zumbi 1", "Zumbi 2"…, continuando a numeração que já existe) e cada cópia tem PV próprio
  em combatant_secrets. PJs entram uma vez só e usam o PV da própria ficha.
  p_resources: recursos iniciais de cada cópia, ex.: {"pv": {"atual": 12, "max": 12}}.
*/
create or replace function public.add_combatants(
  p_encounter uuid,
  p_character uuid,
  p_count int default 1,
  p_resources jsonb default '{}',
  p_hidden boolean default false
) returns setof public.combatants
language plpgsql security definer set search_path = '' as $$
declare
  enc public.encounters;
  ch public.characters;
  base text;
  start_n int;
  label text;
  rec public.combatants;
begin
  perform private.require_user();
  select * into enc from public.encounters where id = p_encounter;
  if enc.id is null or not private.is_gm(enc.campaign_id) then
    raise exception 'Só o mestre monta o combate' using errcode = '42501';
  end if;
  select * into ch from public.characters where id = p_character and campaign_id = enc.campaign_id;
  if ch.id is null then
    raise exception 'Personagem não encontrado nesta mesa' using errcode = 'PT404';
  end if;
  if p_count < 1 or p_count > 30 then
    raise exception 'Quantidade entre 1 e 30' using errcode = '22023';
  end if;

  base := coalesce(nullif(ch.data -> 'values' ->> 'nome', ''), nullif(ch.name, ''), 'Combatente');

  if ch.kind = 'pc' then
    if exists (select 1 from public.combatants where encounter_id = p_encounter and character_id = ch.id) then
      raise exception '% já está no combate', base using errcode = '23505';
    end if;
    insert into public.combatants (encounter_id, campaign_id, character_id, label, order_index, hidden)
    values (p_encounter, enc.campaign_id, ch.id, base, 1000, p_hidden)
    returning * into rec;
    return next rec;
    return;
  end if;

  -- Continua a numeração: se já há "Zumbi 1" e "Zumbi 2", as novas cópias começam em 3.
  select greatest(coalesce(max(substring(c.label from '\s(\d+)$')::int), 0), count(*)) into start_n
  from public.combatants c
  where c.encounter_id = p_encounter and c.character_id = ch.id;

  for i in 1..p_count loop
    label := case when p_count = 1 and start_n = 0 then base else base || ' ' || (start_n + i) end;
    insert into public.combatants (encounter_id, campaign_id, character_id, label, order_index, hidden)
    values (p_encounter, enc.campaign_id, ch.id, label, 1000 + start_n + i, p_hidden)
    returning * into rec;
    insert into public.combatant_secrets (combatant_id, resources) values (rec.id, coalesce(p_resources, '{}'));
    select * into rec from public.combatants where id = rec.id;
    return next rec;
  end loop;
end $$;

-- ---------- iniciativa e turnos ----------

-- Quem está agindo. A posição (turn_index) conta também os combatentes escondidos, que os
-- jogadores não recebem; por isso o destaque na tela usa o id, não a posição.
alter table public.encounters add column current_combatant_id uuid references public.combatants (id) on delete set null;

create or replace function private.refresh_current(p_encounter uuid) returns void
language sql security definer set search_path = '' as $$
  update public.encounters e
  set current_combatant_id = case when e.status = 'active' then (
    select c.id from public.combatants c
    where c.encounter_id = e.id
    order by c.order_index, c.label
    offset e.turn_index limit 1
  ) end
  where e.id = p_encounter
$$;

-- Ordena pela iniciativa (maior primeiro; empate pelo nome; sem iniciativa vai para o fim).
create or replace function public.sort_initiative(p_encounter uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  enc public.encounters;
begin
  select * into enc from public.encounters where id = p_encounter;
  if enc.id is null or not private.is_gm(enc.campaign_id) then
    raise exception 'Só o mestre ordena a iniciativa' using errcode = '42501';
  end if;
  update public.combatants c set order_index = o.n
  from (
    select id, row_number() over (order by initiative desc nulls last, label) - 1 as n
    from public.combatants where encounter_id = p_encounter
  ) o
  where c.id = o.id;
  perform private.refresh_current(p_encounter);
end $$;

/*
  Avança (p_step = 1) ou volta (p_step = -1) o turno. No fim da ordem, começa a próxima rodada.
  Em preparação, o primeiro avanço inicia o combate na rodada 1.
*/
create or replace function public.advance_turn(p_encounter uuid, p_step int default 1) returns public.encounters
language plpgsql security definer set search_path = '' as $$
declare
  enc public.encounters;
  n int;
  t int;
  r int;
begin
  select * into enc from public.encounters where id = p_encounter for update;
  if enc.id is null or not private.is_gm(enc.campaign_id) then
    raise exception 'Só o mestre avança o turno' using errcode = '42501';
  end if;
  select count(*) into n from public.combatants where encounter_id = p_encounter;
  if n = 0 then
    raise exception 'Adicione combatentes antes de começar' using errcode = '22023';
  end if;

  if enc.status <> 'active' then
    update public.encounters set status = 'active', round = 1, turn_index = 0 where id = p_encounter;
    perform private.refresh_current(p_encounter);
    select * into enc from public.encounters where id = p_encounter;
    return enc;
  end if;

  t := enc.turn_index + sign(p_step)::int;
  r := enc.round;
  if t >= n then
    t := 0;
    r := r + 1;
  elsif t < 0 then
    if r <= 1 then
      t := 0;
    else
      t := n - 1;
      r := r - 1;
    end if;
  end if;
  update public.encounters set turn_index = t, round = r where id = p_encounter;
  perform private.refresh_current(p_encounter);
  select * into enc from public.encounters where id = p_encounter;
  return enc;
end $$;

-- Soma (ou define) um recurso de inimigo de forma atômica: toques rápidos do mestre não se perdem.
create or replace function public.adjust_combatant_resource(p_combatant uuid, p_resource text, p_delta numeric, p_set numeric default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sec public.combatant_secrets;
begin
  perform private.require_user();
  select * into sec from public.combatant_secrets where combatant_id = p_combatant for update;
  if sec.combatant_id is null or not private.is_gm(sec.campaign_id) then
    raise exception 'Só o mestre mexe no PV de inimigos' using errcode = '42501';
  end if;
  if sec.resources -> p_resource is null then
    raise exception 'Recurso % não existe neste combatente', p_resource using errcode = 'PT404';
  end if;
  update public.combatant_secrets
  set resources = jsonb_set(
    resources,
    array[p_resource, 'atual'],
    to_jsonb(coalesce(p_set, coalesce((resources -> p_resource ->> 'atual')::numeric, 0) + p_delta))
  )
  where combatant_id = p_combatant
  returning resources into sec.resources;
  return sec.resources;
end $$;

revoke execute on function
  public.adjust_combatant_resource(uuid, text, numeric, numeric),
  public.add_combatants(uuid, uuid, int, jsonb, boolean),
  public.sort_initiative(uuid),
  public.advance_turn(uuid, int)
from public, anon;

grant execute on function
  public.adjust_combatant_resource(uuid, text, numeric, numeric),
  public.add_combatants(uuid, uuid, int, jsonb, boolean),
  public.sort_initiative(uuid),
  public.advance_turn(uuid, int)
to authenticated;
