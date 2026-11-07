-- M6: itens. Copiar da biblioteca, pegar de baú aberto, identificar item misterioso.

/*
  Copia um item (normalmente da biblioteca) para um personagem, um baú, o grupo ou a biblioteca.
  Se o item original não está identificado, a cópia leva o segredo junto.
*/
create or replace function public.copy_item(p_item uuid, p_holder_type public.holder_type, p_holder_id uuid default null, p_quantity numeric default null)
returns public.items
language plpgsql security definer set search_path = '' as $$
declare
  src public.items;
  dst public.items;
begin
  perform private.require_user();
  select * into src from public.items where id = p_item;
  if src.id is null or not private.is_gm(src.campaign_id) then
    raise exception 'Só o mestre copia itens' using errcode = '42501';
  end if;
  insert into public.items (campaign_id, holder_type, holder_id, name, description, quantity, equipped, data, modifiers, identified, sort)
  values (src.campaign_id, p_holder_type, p_holder_id, src.name, src.description, coalesce(p_quantity, src.quantity), false, src.data, src.modifiers, src.identified, src.sort)
  returning * into dst;
  insert into public.item_secrets (item_id, real_name, real_description, real_modifiers)
  select dst.id, s.real_name, s.real_description, s.real_modifiers from public.item_secrets s where s.item_id = src.id;
  return dst;
end $$;

/*
  Jogador pega um item de um baú aberto ("livre para pegar") para um personagem seu.
  Distribuir (baú "o mestre distribui") é o mestre mudando o dono do item direto.
*/
create or replace function public.take_loot_item(p_item uuid, p_character uuid) returns public.items
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  it public.items;
  pool public.loot_pools;
  ch public.characters;
begin
  select * into it from public.items where id = p_item for update;
  if it.id is null or it.holder_type <> 'loot' then
    raise exception 'Item não está em um baú' using errcode = 'PT404';
  end if;
  select * into pool from public.loot_pools where id = it.holder_id;
  if not pool.revealed or not private.is_member(pool.campaign_id) then
    raise exception 'Item não encontrado' using errcode = 'PT404';
  end if;
  if pool.mode <> 'free_pick' and not private.is_gm(pool.campaign_id) then
    raise exception 'Neste baú quem distribui é o mestre' using errcode = '42501';
  end if;
  select * into ch from public.characters where id = p_character and campaign_id = it.campaign_id;
  if ch.id is null or (ch.owner_id <> uid and not private.is_gm(it.campaign_id)) then
    raise exception 'Escolha um personagem seu' using errcode = '42501';
  end if;
  update public.items set holder_type = 'character', holder_id = ch.id, equipped = false where id = it.id returning * into it;
  return it;
end $$;

/* Revela um item misterioso: nome, descrição e modificadores verdadeiros passam a valer. */
create or replace function public.identify_item(p_item uuid) returns public.items
language plpgsql security definer set search_path = '' as $$
declare
  it public.items;
  sec public.item_secrets;
begin
  perform private.require_user();
  select * into it from public.items where id = p_item for update;
  if it.id is null or not private.is_gm(it.campaign_id) then
    raise exception 'Só o mestre identifica itens' using errcode = '42501';
  end if;
  select * into sec from public.item_secrets where item_id = it.id;
  update public.items
  set identified = true,
      name = coalesce(sec.real_name, name),
      description = coalesce(sec.real_description, description),
      modifiers = coalesce(sec.real_modifiers, modifiers)
  where id = it.id
  returning * into it;
  delete from public.item_secrets where item_id = it.id;
  return it;
end $$;

-- Baú revelado ou escondido muda o que os jogadores veem sem mexer nos itens: avisa via itens.
create or replace function private.touch_pool_items() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.items set updated_at = now() where holder_type = 'loot' and holder_id = new.id;
  return null;
end $$;

create trigger touch_pool_items after update of revealed, mode on public.loot_pools
  for each row execute function private.touch_pool_items();

revoke execute on function
  public.copy_item(uuid, public.holder_type, uuid, numeric),
  public.take_loot_item(uuid, uuid),
  public.identify_item(uuid)
from public, anon;

grant execute on function
  public.copy_item(uuid, public.holder_type, uuid, numeric),
  public.take_loot_item(uuid, uuid),
  public.identify_item(uuid)
to authenticated;

-- O app avisa "o mestre revelou um handout" comparando o antes e o depois da linha.
alter table public.handouts replica identity full;
