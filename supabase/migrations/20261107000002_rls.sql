-- Regras de acesso. Ver "Permissões e segredos" no documento de arquitetura.
-- Princípio: o que é secreto mora em tabela própria (item_secrets, combatant_secrets);
-- RLS filtra linhas, e privilégios por coluna impedem escrita direta onde há função própria.

-- ---------- funções auxiliares (executam como dono para não recursar no RLS) ----------

create or replace function private.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m where m.campaign_id = c and m.user_id = auth.uid())
$$;

create or replace function private.is_gm(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m where m.campaign_id = c and m.user_id = auth.uid() and m.role = 'gm')
$$;

create or replace function private.shares_campaign(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members a
    join public.campaign_members b on b.campaign_id = a.campaign_id
    where a.user_id = auth.uid() and b.user_id = u
  )
$$;

create or replace function private.owns_character(ch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.characters c where c.id = ch and c.owner_id = auth.uid())
$$;

create or replace function private.try_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

grant usage on schema private to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------- privilégios ----------
-- O app exige login: anon não toca em nada.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Tabelas escritas só por funções do banco ou pelo servidor.
revoke insert, update, delete on public.character_changes, public.rolls from authenticated;
revoke insert, update on public.campaigns, public.campaign_members from authenticated;
revoke update on public.profiles, public.characters, public.items from authenticated;

grant update (name, description, settings) on public.campaigns to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
-- data só muda por apply_character_ops (fila de operações, histórico, idempotência).
grant update (name, portrait_path, status, visibility, is_library) on public.characters to authenticated;
grant update (name, description, quantity, equipped, data, modifiers, identified, sort, holder_type, holder_id) on public.items to authenticated;

-- ---------- RLS ----------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'templates', 'template_versions', 'campaigns', 'campaign_members', 'characters',
    'character_changes', 'loot_pools', 'items', 'item_secrets', 'encounters', 'combatants',
    'combatant_secrets', 'rolls', 'folders', 'handouts', 'handout_recipients', 'notes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy "ver perfis de quem joga comigo" on public.profiles for select to authenticated
  using (id = auth.uid() or private.shares_campaign(id));
create policy "editar o próprio perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- templates
create policy "templates são públicos" on public.templates for select to authenticated using (true);
create policy "criar template próprio" on public.templates for insert to authenticated with check (owner_id = auth.uid());
create policy "editar template próprio" on public.templates for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "apagar template próprio" on public.templates for delete to authenticated using (owner_id = auth.uid());

create policy "versões são públicas" on public.template_versions for select to authenticated using (true);
create policy "publicar versão de template próprio" on public.template_versions for insert to authenticated
  with check (exists (select 1 from public.templates t where t.id = template_id and t.owner_id = auth.uid()));

-- campaigns (criação por create_campaign)
create policy "membros veem a mesa" on public.campaigns for select to authenticated using (private.is_member(id));
create policy "mestre edita a mesa" on public.campaigns for update to authenticated
  using (private.is_gm(id)) with check (private.is_gm(id));
create policy "mestre apaga a mesa" on public.campaigns for delete to authenticated using (private.is_gm(id));

-- campaign_members (entrada por join_campaign)
create policy "membros veem membros" on public.campaign_members for select to authenticated
  using (private.is_member(campaign_id));
create policy "sair ou remover jogador" on public.campaign_members for delete to authenticated
  using (role <> 'gm' and (user_id = auth.uid() or private.is_gm(campaign_id)));

-- characters
create policy "ver personagens" on public.characters for select to authenticated
  using (
    private.is_gm(campaign_id)
    or owner_id = auth.uid()
    or (visibility = 'public' and private.is_member(campaign_id))
  );
create policy "criar personagem" on public.characters for insert to authenticated
  with check (
    owner_id = auth.uid()
    and private.is_member(campaign_id)
    and (private.is_gm(campaign_id) or (kind = 'pc' and visibility = 'public' and not is_library))
  );
create policy "editar personagem" on public.characters for update to authenticated
  using (owner_id = auth.uid() or private.is_gm(campaign_id))
  with check (owner_id = auth.uid() or private.is_gm(campaign_id));
create policy "apagar personagem" on public.characters for delete to authenticated
  using (owner_id = auth.uid() or private.is_gm(campaign_id));

create policy "histórico: mestre e dono" on public.character_changes for select to authenticated
  using (private.is_gm(campaign_id) or private.owns_character(character_id));

-- loot
create policy "ver baú revelado" on public.loot_pools for select to authenticated
  using (private.is_gm(campaign_id) or (revealed and private.is_member(campaign_id)));
create policy "mestre cria baú" on public.loot_pools for insert to authenticated with check (private.is_gm(campaign_id));
create policy "mestre edita baú" on public.loot_pools for update to authenticated
  using (private.is_gm(campaign_id)) with check (private.is_gm(campaign_id));
create policy "mestre apaga baú" on public.loot_pools for delete to authenticated using (private.is_gm(campaign_id));

-- items: visível se o dono do item é visível (as subconsultas respeitam o RLS de quem lê)
create policy "ver itens" on public.items for select to authenticated
  using (
    private.is_gm(campaign_id)
    or (
      private.is_member(campaign_id)
      and (
        holder_type = 'party'
        or (holder_type = 'character' and exists (select 1 from public.characters c where c.id = holder_id))
        or (holder_type = 'loot' and exists (select 1 from public.loot_pools l where l.id = holder_id))
      )
    )
  );
create policy "criar item" on public.items for insert to authenticated
  with check (
    private.is_gm(campaign_id)
    or (holder_type = 'character' and private.owns_character(holder_id) and identified)
  );
create policy "editar item" on public.items for update to authenticated
  using (private.is_gm(campaign_id) or (holder_type = 'character' and private.owns_character(holder_id)))
  with check (private.is_gm(campaign_id) or (holder_type = 'character' and private.owns_character(holder_id)));
create policy "apagar item" on public.items for delete to authenticated
  using (private.is_gm(campaign_id) or (holder_type = 'character' and private.owns_character(holder_id)));

create policy "segredo de item: só mestre" on public.item_secrets for all to authenticated
  using (private.is_gm(campaign_id)) with check (private.is_gm(campaign_id));

-- combate
create policy "ver combate iniciado" on public.encounters for select to authenticated
  using (private.is_gm(campaign_id) or (status <> 'prep' and private.is_member(campaign_id)));
create policy "mestre controla combate" on public.encounters for all to authenticated
  using (private.is_gm(campaign_id)) with check (private.is_gm(campaign_id));

create policy "ver combatentes" on public.combatants for select to authenticated
  using (
    private.is_gm(campaign_id)
    or (not hidden and exists (select 1 from public.encounters e where e.id = encounter_id))
  );
create policy "mestre controla combatentes" on public.combatants for all to authenticated
  using (private.is_gm(campaign_id)) with check (private.is_gm(campaign_id));

create policy "PV de inimigo: só mestre" on public.combatant_secrets for all to authenticated
  using (private.is_gm(campaign_id)) with check (private.is_gm(campaign_id));

-- rolagens (inseridas pela Edge Function com a chave de serviço)
create policy "ver rolagens" on public.rolls for select to authenticated
  using (
    private.is_gm(campaign_id)
    or (
      private.is_member(campaign_id)
      and (visibility = 'public' or (visibility = 'self_gm' and user_id = auth.uid()))
    )
  );

-- pastas
create policy "membros veem pastas" on public.folders for select to authenticated using (private.is_member(campaign_id));
create policy "mestre organiza pastas" on public.folders for all to authenticated
  using (private.is_gm(campaign_id)) with check (private.is_gm(campaign_id));

-- handouts
create policy "ver handout revelado" on public.handouts for select to authenticated
  using (
    private.is_gm(campaign_id)
    or (
      private.is_member(campaign_id)
      and (
        revealed_to_all
        or exists (select 1 from public.handout_recipients r where r.handout_id = handouts.id and r.user_id = auth.uid())
      )
    )
  );
create policy "mestre controla handouts" on public.handouts for all to authenticated
  using (private.is_gm(campaign_id)) with check (private.is_gm(campaign_id));

create policy "ver destinatários" on public.handout_recipients for select to authenticated
  using (private.is_gm(campaign_id) or user_id = auth.uid());
create policy "mestre escolhe destinatários" on public.handout_recipients for all to authenticated
  using (private.is_gm(campaign_id)) with check (private.is_gm(campaign_id));

-- notes
create policy "ver notas" on public.notes for select to authenticated
  using (
    author_id = auth.uid()
    or (visibility = 'public' and private.is_member(campaign_id))
    or (visibility = 'gm' and private.is_gm(campaign_id))
  );
create policy "escrever nota" on public.notes for insert to authenticated
  with check (author_id = auth.uid() and private.is_member(campaign_id));
create policy "editar nota própria" on public.notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and private.is_member(campaign_id));
create policy "apagar nota própria" on public.notes for delete to authenticated using (author_id = auth.uid());

-- ---------- travas que RLS sozinho não expressa ----------

create or replace function private.guard_characters() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.template_versions tv
      join public.campaigns c on c.template_id = tv.template_id
      where tv.id = new.template_version_id and c.id = new.campaign_id
    ) then
      raise exception 'A versão de template não pertence ao sistema desta mesa' using errcode = 'check_violation';
    end if;
    new.version := 0;
  elsif current_user = 'authenticated'
    and (new.visibility, new.is_library) is distinct from (old.visibility, old.is_library)
    and not private.is_gm(old.campaign_id) then
    raise exception 'Só o mestre muda visibilidade e biblioteca' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger guard_characters before insert or update on public.characters
  for each row execute function private.guard_characters();

create or replace function private.guard_items() returns trigger
language plpgsql set search_path = '' as $$
declare holder_campaign uuid;
begin
  if new.holder_type = 'character' then
    select campaign_id into holder_campaign from public.characters where id = new.holder_id;
  elsif new.holder_type = 'loot' then
    select campaign_id into holder_campaign from public.loot_pools where id = new.holder_id;
  else
    holder_campaign := new.campaign_id;
  end if;
  if holder_campaign is distinct from new.campaign_id then
    raise exception 'O dono do item é de outra mesa' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and current_user = 'authenticated' and not private.is_gm(old.campaign_id) then
    if new.identified is distinct from old.identified then
      raise exception 'Só o mestre identifica itens' using errcode = 'insufficient_privilege';
    end if;
    if (new.holder_type, new.holder_id) is distinct from (old.holder_type, old.holder_id) then
      raise exception 'Transferência de itens passa pelo mestre' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

create trigger guard_items before insert or update on public.items
  for each row execute function private.guard_items();

-- Segredos e destinatários herdam a mesa do registro principal.
create or replace function private.inherit_campaign() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'item_secrets' then
    select campaign_id into new.campaign_id from public.items where id = new.item_id;
  elsif tg_table_name = 'combatant_secrets' then
    select campaign_id into new.campaign_id from public.combatants where id = new.combatant_id;
  elsif tg_table_name = 'handout_recipients' then
    select campaign_id into new.campaign_id from public.handouts where id = new.handout_id;
  elsif tg_table_name = 'combatants' then
    select campaign_id into new.campaign_id from public.encounters where id = new.encounter_id;
  end if;
  if new.campaign_id is null then
    raise exception 'Registro principal não encontrado' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger inherit_campaign before insert on public.item_secrets for each row execute function private.inherit_campaign();
create trigger inherit_campaign before insert on public.combatant_secrets for each row execute function private.inherit_campaign();
create trigger inherit_campaign before insert on public.handout_recipients for each row execute function private.inherit_campaign();
create trigger inherit_campaign before insert on public.combatants for each row execute function private.inherit_campaign();

-- ---------- Storage: retratos e imagens de handouts ----------
-- Caminho dos arquivos: <campaign_id>/<arquivo>.

insert into storage.buckets (id, name, public) values ('portraits', 'portraits', false), ('handouts', 'handouts', false)
on conflict (id) do nothing;

create policy "retratos: membros da mesa veem" on storage.objects for select to authenticated
  using (bucket_id = 'portraits' and private.is_member(private.try_uuid((storage.foldername(name))[1])));
create policy "retratos: membros enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'portraits' and private.is_member(private.try_uuid((storage.foldername(name))[1])));
create policy "retratos: autor ou mestre apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'portraits' and (owner = auth.uid() or private.is_gm(private.try_uuid((storage.foldername(name))[1]))));

create policy "handouts: quem vê o handout vê a imagem" on storage.objects for select to authenticated
  using (
    bucket_id = 'handouts'
    and (
      private.is_gm(private.try_uuid((storage.foldername(name))[1]))
      or exists (select 1 from public.handouts h where h.image_path = objects.name)
    )
  );
create policy "handouts: mestre envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'handouts' and private.is_gm(private.try_uuid((storage.foldername(name))[1])));
create policy "handouts: mestre apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'handouts' and private.is_gm(private.try_uuid((storage.foldername(name))[1])));

-- ---------- tempo real ----------

alter publication supabase_realtime add table
  public.campaigns, public.campaign_members, public.characters, public.items, public.loot_pools,
  public.encounters, public.combatants, public.combatant_secrets, public.rolls, public.handouts,
  public.handout_recipients, public.notes;
