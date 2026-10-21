begin;

alter table public.profiles
  add column terms_version text,
  add column marketing_consent boolean not null default false,
  add column marketing_consent_at timestamptz;

create table public.auth_rate_limits (
  bucket_key text primary key check (bucket_key ~ '^[a-f0-9]{64}$'),
  attempts integer not null check (attempts > 0),
  window_started_at timestamptz not null default now()
);
create index auth_rate_limits_window_idx on public.auth_rate_limits(window_started_at);
alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from anon, authenticated;
grant all on public.auth_rate_limits to service_role;
create policy auth_limits_server_only on public.auth_rate_limits for all to service_role
  using (true) with check (true);

create function public.check_auth_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after integer)
language plpgsql security definer set search_path = '' as $$
declare
  entry public.auth_rate_limits%rowtype;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or
    p_limit not between 1 and 1000 or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit' using errcode = '22023';
  end if;
  insert into public.auth_rate_limits as buckets (bucket_key, attempts, window_started_at)
    values (p_key, 1, now())
    on conflict (bucket_key) do update
      set attempts = case when buckets.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then 1 else least(buckets.attempts + 1, 1000000) end,
      window_started_at = case when buckets.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then now() else buckets.window_started_at end
    returning * into entry;
  return query select entry.attempts <= p_limit,
    greatest(1, ceil(p_window_seconds - extract(epoch from now() - entry.window_started_at))::integer);
end;
$$;
revoke all on function public.check_auth_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_auth_rate_limit(text, integer, integer) to service_role;

create function public.record_registration_consent(
  p_user uuid, p_name text, p_phone text, p_marketing boolean
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_name is null or length(trim(p_name)) not between 2 and 150 or
    p_phone is null or p_phone !~ '^[+0-9 ()-]{8,30}$' or
    length(regexp_replace(p_phone, '[^0-9]', '', 'g')) not between 8 and 15 or p_marketing is null then
    raise exception 'Invalid profile' using errcode = '22023';
  end if;
  -- A repeated signup must not overwrite consent or data of an existing account.
  update public.profiles set nome = trim(p_name), telefone = p_phone,
    consentimento_em = now(), terms_version = '2026-10-21',
    marketing_consent = p_marketing, marketing_consent_at = case when p_marketing then now() else null end,
    onboarding_concluido = true
    where id = p_user and consentimento_em is null;
end;
$$;
revoke all on function public.record_registration_consent(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_registration_consent(uuid, text, text, boolean) to service_role;

create function public.complete_own_profile(p_name text, p_phone text, p_accept_terms boolean, p_marketing boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  own_id uuid := auth.uid();
begin
  if own_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_accept_terms is distinct from true or p_name is null or length(trim(p_name)) not between 2 and 150 or
    p_phone is null or p_phone !~ '^[+0-9 ()-]{8,30}$' or
    length(regexp_replace(p_phone, '[^0-9]', '', 'g')) not between 8 and 15 or p_marketing is null then
    raise exception 'Profile and consent required' using errcode = '22023';
  end if;
  update public.profiles set nome = trim(p_name), telefone = p_phone,
    consentimento_em = coalesce(consentimento_em, now()), terms_version = '2026-10-21',
    marketing_consent = p_marketing, marketing_consent_at = case when p_marketing then now() else null end,
    onboarding_concluido = true where id = own_id;
  if not found then raise exception 'Profile not provisioned' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.complete_own_profile(text, text, boolean, boolean) from public, anon;
grant execute on function public.complete_own_profile(text, text, boolean, boolean) to authenticated;

commit;
