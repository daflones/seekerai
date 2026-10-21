begin;

-- Configurações não-secretas editáveis pelo admin (ex.: provedor de busca).
create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon;
grant select on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);

insert into public.app_settings (key, value) values
  ('search_provider', '"google_places"'::jsonb);

-- Status 'review' para conciliação manual (ex.: estorno recebido).
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'paid', 'failed', 'refunded', 'expired', 'review'));

-- Escreve configuração administrativa (apenas admin, auditado).
create function public.configure_app_setting(
  p_key text, p_value jsonb, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'Reason required (5-300 chars)' using errcode = '22023';
  end if;
  if p_key not in ('search_provider') then
    raise exception 'Unknown setting key' using errcode = '22023';
  end if;
  if p_key = 'search_provider' and
    (jsonb_typeof(p_value) <> 'string' or
     p_value #>> '{}' not in ('google_places', 'apify')) then
    raise exception 'Invalid provider value' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_by)
    values (p_key, p_value, (select auth.uid()))
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (ator, acao, alvo, diff)
    values ((select auth.uid()), 'app_setting:update', p_key,
            jsonb_build_object('value', p_value, 'reason', p_reason));
end;
$$;

-- Secret de integração criptografado (envelope gerado no app com
-- APP_ENCRYPTION_KEY; contexto = '<provedor>:<nome>').
create function public.upsert_integration_secret(
  p_provedor text, p_nome text, p_encrypted text, p_ultimos4 text, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'Reason required (5-300 chars)' using errcode = '22023';
  end if;
  if p_provedor is null or p_provedor !~ '^[a-z][a-z0-9_]{1,40}$' or
    p_nome is null or p_nome !~ '^[A-Z][A-Z0-9_]{1,60}$' or
    p_encrypted is null or p_encrypted !~ '^v1\.' or
    length(p_encrypted) > 4000 or p_ultimos4 is null or length(p_ultimos4) > 4 then
    raise exception 'Invalid secret payload' using errcode = '22023';
  end if;
  insert into public.integration_secrets (provedor, nome, valor_criptografado, ultimos4, atualizado_por)
    values (p_provedor, p_nome, p_encrypted, p_ultimos4, (select auth.uid()))
  on conflict (provedor, nome) do update
    set valor_criptografado = excluded.valor_criptografado,
        ultimos4 = excluded.ultimos4,
        atualizado_por = excluded.atualizado_por,
        updated_at = now();
  insert into public.audit_log (ator, acao, alvo, diff)
    values ((select auth.uid()), 'integration_secret:upsert',
            p_provedor || ':' || p_nome,
            jsonb_build_object('ultimos4', p_ultimos4, 'reason', p_reason));
end;
$$;

-- Lista secrets sem expor valores (apenas metadados para a UI admin).
create function public.list_integration_secrets()
returns table(provedor text, nome text, ultimos4 text, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
    select s.provedor, s.nome, s.ultimos4, s.updated_at
    from public.integration_secrets s
    order by s.provedor, s.nome;
end;
$$;

create function public.delete_integration_secret(
  p_provedor text, p_nome text, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'Reason required (5-300 chars)' using errcode = '22023';
  end if;
  delete from public.integration_secrets
    where provedor = p_provedor and nome = p_nome;
  insert into public.audit_log (ator, acao, alvo, diff)
    values ((select auth.uid()), 'integration_secret:delete',
            p_provedor || ':' || p_nome, jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.configure_app_setting(text, jsonb, text)
  from public, anon;
revoke all on function public.upsert_integration_secret(text, text, text, text, text)
  from public, anon;
revoke all on function public.list_integration_secrets()
  from public, anon;
revoke all on function public.delete_integration_secret(text, text, text)
  from public, anon;
grant execute on function public.configure_app_setting(text, jsonb, text) to authenticated, service_role;
grant execute on function public.upsert_integration_secret(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.list_integration_secrets() to authenticated, service_role;
grant execute on function public.delete_integration_secret(text, text, text) to authenticated, service_role;

commit;
