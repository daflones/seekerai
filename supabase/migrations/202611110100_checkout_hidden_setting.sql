begin;

-- Libera 'checkout_hidden' (visibilidade da vitrine /app/planos) no
-- configure_app_setting — a rota admin chamava o RPC e caía em
-- 'Unknown setting key'. Formato: {"plans": ["slug"...], "packs": ["id"...]}.
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
                   'checkout_hidden') then
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
