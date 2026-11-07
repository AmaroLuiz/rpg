-- Funções chamadas pelo app (supabase.rpc). Executam como dono e conferem o papel antes de gravar.

-- ---------- utilidades internas ----------

-- Grava `value` em `path`, criando objetos no caminho. Mesma semântica de applyOps no motor.
create or replace function private.jsonb_set_deep(target jsonb, path text[], value jsonb) returns jsonb
language plpgsql immutable as $$
declare
  head text;
begin
  if coalesce(array_length(path, 1), 0) = 0 then
    return value;
  end if;
  if target is null or jsonb_typeof(target) <> 'object' then
    target := '{}'::jsonb;
  end if;
  head := path[1];
  if array_length(path, 1) = 1 then
    return target || jsonb_build_object(head, value);
  end if;
  return target || jsonb_build_object(head, private.jsonb_set_deep(target -> head, path[2:], value));
end $$;

-- Código de convite: 6 caracteres sem os ambíguos (0/O, 1/I/L).
create or replace function private.new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.campaigns where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'É preciso entrar na conta' using errcode = '28000';
  end if;
  return uid;
end $$;

-- ---------- mesa ----------

create or replace function public.create_campaign(p_name text, p_template_slug text, p_description text default '')
returns public.campaigns
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  tpl uuid;
  result public.campaigns;
begin
  select id into tpl from public.templates where slug = p_template_slug;
  if tpl is null then
    raise exception 'Sistema desconhecido: %', p_template_slug using errcode = 'P0002';
  end if;
  insert into public.campaigns (name, description, template_id, gm_id, invite_code)
  values (trim(p_name), coalesce(p_description, ''), tpl, uid, private.new_invite_code())
  returning * into result;
  insert into public.campaign_members (campaign_id, user_id, role) values (result.id, uid, 'gm');
  return result;
end $$;

create or replace function public.join_campaign(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  cid uuid;
begin
  select id into cid from public.campaigns
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if cid is null then
    raise exception 'Código de convite inválido' using errcode = 'P0002';
  end if;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (cid, uid, 'player')
  on conflict (campaign_id, user_id) do nothing;
  return cid;
end $$;

create or replace function public.regenerate_invite_code(p_campaign uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  perform private.require_user();
  if not private.is_gm(p_campaign) then
    raise exception 'Só o mestre troca o convite' using errcode = '42501';
  end if;
  code := private.new_invite_code();
  update public.campaigns set invite_code = code where id = p_campaign;
  return code;
end $$;

-- ---------- personagens ----------

-- Cria personagem na versão atual do template da mesa. Roda como quem chama: o RLS decide.
create or replace function public.create_character(
  p_campaign uuid,
  p_name text,
  p_data jsonb,
  p_kind public.character_kind default 'pc',
  p_visibility public.character_visibility default 'public',
  p_is_library boolean default false
) returns public.characters
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := private.require_user();
  tv uuid;
  result public.characters;
begin
  select v.id into tv
  from public.campaigns c
  join public.templates t on t.id = c.template_id
  join public.template_versions v on v.template_id = t.id and v.version = t.current_version
  where c.id = p_campaign;
  if tv is null then
    raise exception 'Mesa não encontrada' using errcode = 'P0002';
  end if;
  insert into public.characters (campaign_id, owner_id, kind, template_version_id, name, data, visibility, is_library)
  values (p_campaign, uid, p_kind, tv, coalesce(p_name, ''), coalesce(p_data, '{"values": {}, "lists": {}, "conditions": []}'), p_visibility, p_is_library)
  returning * into result;
  return result;
end $$;

/*
  Aplica um lote de operações na ficha. É o único caminho de escrita em characters.data.
  p_ops: [{"op": "set", "path": [...], "value": ...} | {"op": "inc", "path": [...], "by": n} | {"op": "unset", "path": [...]}]
  - Última edição vence por caminho, na ordem de chegada.
  - p_op_id identifica o lote: reenviar o mesmo lote (fila offline) não aplica de novo.
  - Cada mudança fica em character_changes, com valor antigo e novo, para desfazer.
*/
create or replace function public.apply_character_ops(p_character uuid, p_op_id uuid, p_ops jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  ch public.characters;
  v_data jsonb;
  elem jsonb;
  idx bigint;
  kind text;
  v_path text[];
  old_v jsonb;
  new_v jsonb;
begin
  select * into ch from public.characters where id = p_character for update;
  if ch.id is null or not (ch.owner_id = uid or private.is_gm(ch.campaign_id)) then
    raise exception 'Personagem não encontrado ou sem permissão' using errcode = '42501';
  end if;

  if exists (select 1 from public.character_changes where op_id = p_op_id) then
    return jsonb_build_object('version', ch.version, 'duplicate', true);
  end if;

  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) = 0 or jsonb_array_length(p_ops) > 200 then
    raise exception 'Lote de operações inválido (1 a 200 operações)' using errcode = '22023';
  end if;

  v_data := ch.data;
  for elem, idx in select e, i from jsonb_array_elements(p_ops) with ordinality as x(e, i) loop
    kind := elem ->> 'op';
    if jsonb_typeof(elem -> 'path') <> 'array' then
      raise exception 'Operação % sem caminho', idx using errcode = '22023';
    end if;
    v_path := array(select jsonb_array_elements_text(elem -> 'path'));
    if coalesce(array_length(v_path, 1), 0) = 0 or array_length(v_path, 1) > 8
       or v_path[1] not in ('values', 'lists', 'conditions') then
      raise exception 'Caminho inválido na operação %: %', idx, v_path using errcode = '22023';
    end if;

    old_v := v_data #> v_path;
    case kind
      when 'set' then
        new_v := coalesce(elem -> 'value', 'null'::jsonb);
        v_data := private.jsonb_set_deep(v_data, v_path, new_v);
      when 'inc' then
        if jsonb_typeof(elem -> 'by') <> 'number' then
          raise exception 'inc sem número na operação %', idx using errcode = '22023';
        end if;
        new_v := to_jsonb(
          (case when jsonb_typeof(old_v) = 'number' then old_v::text::numeric else 0 end) + (elem ->> 'by')::numeric
        );
        v_data := private.jsonb_set_deep(v_data, v_path, new_v);
      when 'unset' then
        new_v := null;
        v_data := v_data #- v_path;
      else
        raise exception 'Operação desconhecida: %', kind using errcode = '22023';
    end case;

    insert into public.character_changes (character_id, campaign_id, op_id, op_index, user_id, op, path, old_value, new_value)
    values (ch.id, ch.campaign_id, p_op_id, idx, uid, kind, v_path, old_v, new_v);
  end loop;

  if pg_column_size(v_data) > 512 * 1024 then
    raise exception 'Ficha grande demais' using errcode = '54000';
  end if;

  update public.characters set data = v_data, version = version + 1 where id = ch.id
  returning version into ch.version;
  return jsonb_build_object('version', ch.version, 'duplicate', false);
end $$;

-- ---------- privilégios ----------

revoke execute on function
  public.create_campaign(text, text, text),
  public.join_campaign(text),
  public.regenerate_invite_code(uuid),
  public.create_character(uuid, text, jsonb, public.character_kind, public.character_visibility, boolean),
  public.apply_character_ops(uuid, uuid, jsonb)
from public, anon;

grant execute on function
  public.create_campaign(text, text, text),
  public.join_campaign(text),
  public.regenerate_invite_code(uuid),
  public.create_character(uuid, text, jsonb, public.character_kind, public.character_visibility, boolean),
  public.apply_character_ops(uuid, uuid, jsonb)
to authenticated;
