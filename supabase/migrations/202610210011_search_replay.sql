begin;

-- Runs de busca salvas pelo admin para demonstrações/replays.
create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  query text not null check (length(query) between 1 and 300),
  query_norm text generated always as (lower(btrim(query))) stored,
  provider text not null check (provider in ('google_places', 'apify')),
  results jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (query_norm)
);
alter table public.search_runs enable row level security;
revoke all on public.search_runs from public, anon, authenticated;
grant select on public.search_runs to authenticated;
grant all on public.search_runs to service_role;
create policy search_runs_read_admin on public.search_runs
  for select to authenticated using ((select public.is_admin()));

-- configuração: replay liga/desliga (aplicado somente a chamadas de admin).
insert into public.app_settings (key, value) values
  ('search_replay', '"off"'::jsonb)
on conflict (key) do nothing;

create or replace function public.configure_app_setting(
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
  if p_key not in ('search_provider', 'search_replay') then
    raise exception 'Unknown setting key' using errcode = '22023';
  end if;
  if p_key = 'search_provider' and
    (jsonb_typeof(p_value) <> 'string' or
     p_value #>> '{}' not in ('google_places', 'apify')) then
    raise exception 'Invalid provider value' using errcode = '22023';
  end if;
  if p_key = 'search_replay' and
    (jsonb_typeof(p_value) <> 'string' or p_value #>> '{}' not in ('on', 'off')) then
    raise exception 'Invalid replay value' using errcode = '22023';
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

create function public.list_search_runs()
returns table(id uuid, query text, provider text, resultados integer,
              created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
    select r.id, r.query, r.provider, jsonb_array_length(r.results)::integer,
           r.created_at
    from public.search_runs r
    order by r.created_at desc;
end;
$$;

create function public.delete_search_run(p_run uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'Reason required (5-300 chars)' using errcode = '22023';
  end if;
  delete from public.search_runs where id = p_run;
  insert into public.audit_log (ator, acao, alvo, diff)
    values ((select auth.uid()), 'search_run:delete', p_run::text,
            jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.list_search_runs() from public, anon;
revoke all on function public.delete_search_run(uuid, text) from public, anon;
grant execute on function public.list_search_runs() to authenticated, service_role;
grant execute on function public.delete_search_run(uuid, text) to authenticated, service_role;

commit;
