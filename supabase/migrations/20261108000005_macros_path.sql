-- M7: macros de rolagem ficam em data.macros. Mesma função; muda só a lista de caminhos permitidos.

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
       or v_path[1] not in ('values', 'lists', 'conditions', 'creation', 'macros') then
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
