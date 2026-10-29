begin;

-- Cota diária de quem nunca pagou: completa o saldo até 13 (só a
-- diferença — nunca acumula), uma vez por dia no fuso de São Paulo.
-- O ledger com ref 'daily-pack:YYYY-MM-DD' torna a operação idempotente
-- e auditável; quem tem qualquer pagamento 'paid' não recebe cota.
create or replace function public.daily_credit_topup(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_saldo integer;
  v_ref text;
  v_delta integer;
begin
  if exists (
    select 1 from public.payments where user_id = p_user and status = 'paid'
  ) then
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

-- Chamada pelo app com o JWT do usuário (layout/páginas/rotas) pra
-- garantir a cota do dia antes de mostrar ou validar o saldo.
create or replace function public.claim_daily_credits()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_saldo integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform public.daily_credit_topup(v_user);
  select saldo into v_saldo from public.credit_wallets where user_id = v_user;
  return coalesce(v_saldo, 0);
end;
$$;

-- Garante a cota do dia antes de cobrar qualquer ação — cobre todo
-- consumo via edge functions sem exigir chamada prévia do app.
create or replace function public.reserve_credit_action(
  p_user uuid, p_action text, p_business_ref text, p_service text,
  p_input_hash text, p_request_ref text
) returns public.credit_operations
language plpgsql security definer set search_path = '' as $$
declare
  operation public.credit_operations%rowtype;
  rule public.credit_action_rules%rowtype;
begin
  if p_action is null or p_service is null or
    p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' or
    p_request_ref is null or length(p_request_ref) not between 1 and 150 then
    raise exception 'Invalid action request' using errcode = '22023';
  end if;
  if (p_action = 'search' and p_business_ref is not null) or
    (p_action <> 'search' and (p_business_ref is null or length(p_business_ref) not between 1 and 300)) then
    raise exception 'Invalid business scope' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.services_catalog
    where slug = p_service and ativo and p_action = any(enabled_actions)
  ) then
    raise exception 'Action incompatible with service' using errcode = '22023';
  end if;

  perform public.daily_credit_topup(p_user);

  -- Keep the same lock order for reserve, settle and plan grants.
  perform 1 from public.credit_wallets where user_id = p_user for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;
  select * into operation from public.credit_operations
    where user_id = p_user and request_ref = p_request_ref;
  if found then
    if operation.action <> p_action or operation.service <> p_service or
      operation.business_ref is distinct from p_business_ref or operation.input_hash <> p_input_hash then
      raise exception 'Idempotency reference conflict' using errcode = '22023';
    end if;
    return operation;
  end if;

  select * into rule from public.credit_action_rules where action = p_action for share;
  if not found or not rule.enabled or rule.cost is null then
    raise exception 'Action pricing not configured or disabled' using errcode = 'P0001';
  end if;
  insert into public.credit_operations (user_id, action, business_ref, service, input_hash, request_ref, cost)
    values (p_user, p_action, p_business_ref, p_service, p_input_hash, p_request_ref, rule.cost)
    returning * into operation;
  perform public.consume_credits(p_user, operation.cost, 'action:' || p_action,
    'operation:' || operation.id::text || ':reserve');
  return operation;
end;
$$;

revoke all on function public.daily_credit_topup(uuid) from public, anon, authenticated;
grant execute on function public.daily_credit_topup(uuid) to service_role;
revoke all on function public.claim_daily_credits() from public, anon;
grant execute on function public.claim_daily_credits() to authenticated, service_role;

commit;
