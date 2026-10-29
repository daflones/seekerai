begin;

-- Janela do período grátis: começa no primeiro crédito positivo que não
-- seja estorno (welcome:v1 pra conta nova, welcome-pack:* pro lote
-- retroativo, ou o primeiro daily-pack pra quem nunca recebeu nada).
create or replace function public.daily_credit_window_start(p_user uuid)
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select min(created_at) from public.credit_ledger
      where user_id = p_user and delta > 0 and ref not like 'operation:%'),
    now()
  );
$$;

-- A cota diária só existe dentro da janela de 7 dias.
create or replace function public.daily_credit_topup(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_saldo integer;
  v_ref text;
  v_delta integer;
begin
  if exists (
    select 1 from public.subscriptions
    where user_id = p_user and status in ('active', 'past_due')
  ) then
    return;
  end if;

  if now() > public.daily_credit_window_start(p_user) + interval '7 days' then
    return;
  end if;

  v_ref := 'daily-pack:' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD');
  if exists (
    select 1 from public.credit_ledger where user_id = p_user and ref = v_ref
  ) then
    return;
  end if;

  select saldo into v_saldo from public.credit_wallets
    where user_id = p_user for update;
  if not found then
    return;
  end if;

  v_delta := 13 - v_saldo;
  if v_delta <= 0 then
    return;
  end if;

  perform public.apply_credit_delta(p_user, v_delta, 'creditos_diarios', v_ref);
end;
$$;

-- Agora devolve o saldo e se a janela de 7 dias ainda está aberta —
-- a UI usa 'ativo' pra alternar "volta amanhã" vs "período acabou".
drop function public.claim_daily_credits();
create function public.claim_daily_credits()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_saldo integer;
  v_active boolean;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform public.daily_credit_topup(v_user);
  select saldo into v_saldo from public.credit_wallets where user_id = v_user;
  v_active := not exists (
    select 1 from public.subscriptions
    where user_id = v_user and status in ('active', 'past_due')
  ) and now() <= public.daily_credit_window_start(v_user) + interval '7 days';
  return jsonb_build_object(
    'saldo', coalesce(v_saldo, 0),
    'ativo', v_active,
    'ate', public.daily_credit_window_start(v_user) + interval '7 days'
  );
end;
$$;

revoke all on function public.daily_credit_window_start(uuid) from public, anon, authenticated;
grant execute on function public.daily_credit_window_start(uuid) to service_role;
revoke all on function public.claim_daily_credits() from public, anon;
grant execute on function public.claim_daily_credits() to authenticated, service_role;

commit;
