begin;

-- Busca inteligente de leads: feed de eventos ao vivo (mesmo padrão de
-- ai_jobs/studio_projects) + configuração por plano editável no admin.
alter table public.search_jobs
  add column if not exists eventos jsonb not null default '[]'::jsonb;

create or replace function public.report_job_event(
  p_table text,
  p_id uuid,
  p_pct integer,
  p_etapa text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pct is null or p_etapa is null or length(p_etapa) > 200 or length(p_etapa) = 0 then
    return;
  end if;
  if p_table = 'ai_jobs' then
    update ai_jobs set
      progresso = greatest(0, least(100, p_pct)),
      etapa = p_etapa,
      eventos = case
        when jsonb_array_length(coalesce(eventos, '[]'::jsonb)) < 80
          then coalesce(eventos, '[]'::jsonb) || jsonb_build_object(
            'p', p_pct, 'etapa', p_etapa,
            'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        else eventos
      end,
      updated_at = now()
    where id = p_id and status = 'running';
  elsif p_table = 'studio_projects' then
    update studio_projects set
      progresso = greatest(0, least(100, p_pct)),
      etapa = p_etapa,
      eventos = case
        when jsonb_array_length(coalesce(eventos, '[]'::jsonb)) < 80
          then coalesce(eventos, '[]'::jsonb) || jsonb_build_object(
            'p', p_pct, 'etapa', p_etapa,
            'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        else eventos
      end,
      updated_at = now()
    where id = p_id and status = 'running';
  elsif p_table = 'search_jobs' then
    update search_jobs set
      progresso = greatest(0, least(100, p_pct)),
      etapa = p_etapa,
      eventos = case
        when jsonb_array_length(coalesce(eventos, '[]'::jsonb)) < 80
          then coalesce(eventos, '[]'::jsonb) || jsonb_build_object(
            'p', p_pct, 'etapa', p_etapa,
            'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        else eventos
      end,
      updated_at = now()
    where id = p_id and status = 'running';
  end if;
end;
$$;

revoke all on function report_job_event(text, uuid, integer, text) from public, anon, authenticated;
grant execute on function report_job_event(text, uuid, integer, text) to service_role;

-- Configuração da busca inteligente (admin → Busca de leads).
-- targets: quantos leads a busca tenta entregar por plano.
-- smart_filter: prioriza Instagram + sem site, com rodadas de expansão.
insert into public.app_settings (key, value)
  values ('lead_search', '{
    "targets": {"default": 20, "essencial": 20, "pro": 40, "king": 60},
    "pool_multiplier": 2,
    "smart_filter": true,
    "expand_rounds": 2,
    "expand_radius_km": 25,
    "fallback_site_ok": true
  }'::jsonb)
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
  if p_key not in ('search_provider', 'search_replay', 'domain_price_cents',
                   'first_purchase_discount_pct', 'card_provider', 'credit_packs',
                   'checkout_hidden', 'upgrade_discounts', 'lead_search') then
    raise exception 'Unknown setting key' using errcode = '22023';
  end if;
  if p_key = 'search_provider' and
    (jsonb_typeof(p_value) <> 'string' or
     p_value #>> '{}' not in ('google_places', 'apify')) then
    raise exception 'Invalid provider value' using errcode = '22023';
  end if;
  if p_key = 'domain_price_cents' and
    (jsonb_typeof(p_value) <> 'number' or
     (p_value #>> '{}')::numeric < 500 or (p_value #>> '{}')::numeric > 1000000) then
    raise exception 'Invalid domain price' using errcode = '22023';
  end if;
  if p_key = 'first_purchase_discount_pct' and
    (jsonb_typeof(p_value) <> 'number' or
     (p_value #>> '{}')::numeric < 0 or (p_value #>> '{}')::numeric > 90 or
     (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)) then
    raise exception 'Invalid discount percent' using errcode = '22023';
  end if;
  if p_key = 'credit_packs' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) < 1
       or jsonb_array_length(p_value) > 10 then
      raise exception 'Invalid packs payload' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_value) p
      where jsonb_typeof(p -> 'id') <> 'string'
         or length(p ->> 'id') not between 2 and 40
         or coalesce((p ->> 'credits')::numeric, -1) < 1
         or coalesce((p ->> 'credits')::numeric, -1) > 100000
         or coalesce((p ->> 'brlCents')::numeric, -1) < 100
         or coalesce((p ->> 'brlCents')::numeric, -1) > 500000
         or coalesce((p ->> 'intlCents')::numeric, -1) < 50
         or coalesce((p ->> 'intlCents')::numeric, -1) > 500000
    ) then
      raise exception 'Invalid pack values' using errcode = '22023';
    end if;
  end if;
  if p_key = 'checkout_hidden' then
    if jsonb_typeof(p_value) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_value) k where k not in ('plans', 'packs'))
       or (p_value ? 'plans' and (
            jsonb_typeof(p_value -> 'plans') <> 'array'
            or jsonb_array_length(p_value -> 'plans') > 10
            or exists (select 1 from jsonb_array_elements_text(p_value -> 'plans') s where length(s) > 40)))
       or (p_value ? 'packs' and (
            jsonb_typeof(p_value -> 'packs') <> 'array'
            or jsonb_array_length(p_value -> 'packs') > 20
            or exists (select 1 from jsonb_array_elements_text(p_value -> 'packs') s where length(s) > 40))) then
      raise exception 'Invalid checkout_hidden payload' using errcode = '22023';
    end if;
  end if;
  -- {"essencial:pro":50,...} — chave "de:para", valor inteiro 0..90; 0 = sem desconto.
  if p_key = 'upgrade_discounts' then
    if jsonb_typeof(p_value) is distinct from 'object' then
      raise exception 'Invalid upgrade_discounts payload' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_each(p_value) e
      where e.key !~ '^[a-z0-9_-]{2,40}:[a-z0-9_-]{2,40}$'
         or jsonb_typeof(e.value) <> 'number'
         or (e.value #>> '{}')::numeric < 0 or (e.value #>> '{}')::numeric > 90
         or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
    ) then
      raise exception 'Invalid upgrade_discounts payload' using errcode = '22023';
    end if;
  end if;
  -- Busca inteligente: targets por plano (5..200), multiplicador do pool
  -- (1..4), rodadas de expansão (0..4) e toggles booleanos.
  if p_key = 'lead_search' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception 'Invalid lead_search payload' using errcode = '22023';
    end if;
    if p_value ? 'targets' and (
      jsonb_typeof(p_value -> 'targets') <> 'object'
      or exists (
        select 1 from jsonb_each(p_value -> 'targets') t
        where t.key !~ '^[a-z0-9_-]{2,40}$'
           or jsonb_typeof(t.value) <> 'number'
           or (t.value #>> '{}')::numeric < 5 or (t.value #>> '{}')::numeric > 200
           or (t.value #>> '{}')::numeric <> trunc((t.value #>> '{}')::numeric)
      )
    ) then
      raise exception 'Invalid lead_search targets' using errcode = '22023';
    end if;
    if p_value ? 'pool_multiplier' and (
      jsonb_typeof(p_value -> 'pool_multiplier') <> 'number'
      or (p_value ->> 'pool_multiplier')::numeric < 1
      or (p_value ->> 'pool_multiplier')::numeric > 4
    ) then
      raise exception 'Invalid lead_search pool_multiplier' using errcode = '22023';
    end if;
    if p_value ? 'expand_rounds' and (
      jsonb_typeof(p_value -> 'expand_rounds') <> 'number'
      or (p_value ->> 'expand_rounds')::numeric < 0
      or (p_value ->> 'expand_rounds')::numeric > 4
      or (p_value ->> 'expand_rounds')::numeric <> trunc((p_value ->> 'expand_rounds')::numeric)
    ) then
      raise exception 'Invalid lead_search expand_rounds' using errcode = '22023';
    end if;
    if p_value ? 'expand_radius_km' and (
      jsonb_typeof(p_value -> 'expand_radius_km') <> 'number'
      or (p_value ->> 'expand_radius_km')::numeric < 5
      or (p_value ->> 'expand_radius_km')::numeric > 100
    ) then
      raise exception 'Invalid lead_search expand_radius_km' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(p_value) k
      where k not in ('targets', 'pool_multiplier', 'smart_filter',
                      'expand_rounds', 'expand_radius_km', 'fallback_site_ok')
    ) or (
      (p_value ? 'smart_filter' and jsonb_typeof(p_value -> 'smart_filter') <> 'boolean')
      or (p_value ? 'fallback_site_ok' and jsonb_typeof(p_value -> 'fallback_site_ok') <> 'boolean')
    ) then
      raise exception 'Invalid lead_search payload' using errcode = '22023';
    end if;
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
revoke all on function public.configure_app_setting(text, jsonb, text) from public, anon;
grant execute on function public.configure_app_setting(text, jsonb, text) to authenticated, service_role;

commit;
