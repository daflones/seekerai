begin;

-- Desconto de primeira compra (% sobre a primeira cobrança do plano).
-- 0 = desligado. Editável pelo admin no financeiro; aplica só para quem
-- ainda não tem nenhum pagamento confirmado.
insert into public.app_settings (key, value)
  values ('first_purchase_discount_pct', '20'::jsonb)
  on conflict (key) do nothing;

-- Libera a nova chave no configure_app_setting.
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
  if p_key not in ('search_provider', 'domain_price_cents', 'first_purchase_discount_pct') then
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
