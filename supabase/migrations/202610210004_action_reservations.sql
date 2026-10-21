begin;

create function public.reserve_credit_action(
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

create function public.settle_credit_action(
  p_user uuid, p_request_ref text, p_outcome text
) returns public.credit_operations
language plpgsql security definer set search_path = '' as $$
declare
  operation public.credit_operations%rowtype;
begin
  if p_outcome is null or p_outcome not in ('completed', 'refunded') then
    raise exception 'Invalid outcome' using errcode = '22023';
  end if;
  perform 1 from public.credit_wallets where user_id = p_user for update;
  if not found then raise exception 'Wallet not found' using errcode = 'P0002'; end if;
  select * into operation from public.credit_operations
    where user_id = p_user and request_ref = p_request_ref for update;
  if not found then raise exception 'Operation not found' using errcode = 'P0002'; end if;
  if operation.status = p_outcome then return operation; end if;
  if operation.status <> 'reserved' then
    raise exception 'Operation already settled with another outcome' using errcode = '22023';
  end if;
  if p_outcome = 'refunded' then
    perform public.apply_credit_delta(p_user, operation.cost, 'refund:' || operation.action,
      'operation:' || operation.id::text || ':refund');
  end if;
  update public.credit_operations set status = p_outcome
    where id = operation.id returning * into operation;
  return operation;
end;
$$;

create function public.grant_plan_allowance(
  p_user uuid, p_plan uuid, p_cycle_ref text
) returns public.plan_credit_grants
language plpgsql security definer set search_path = '' as $$
declare
  allowance public.plan_credit_grants%rowtype;
  plan public.plans%rowtype;
begin
  if p_cycle_ref is null or length(p_cycle_ref) not between 1 and 150 then
    raise exception 'Invalid billing cycle reference' using errcode = '22023';
  end if;
  perform 1 from public.credit_wallets where user_id = p_user for update;
  if not found then raise exception 'Wallet not found' using errcode = 'P0002'; end if;
  select * into allowance from public.plan_credit_grants
    where user_id = p_user and cycle_ref = p_cycle_ref;
  if found then
    if allowance.plan_id is distinct from p_plan then
      raise exception 'Billing cycle reference conflict' using errcode = '22023';
    end if;
    return allowance;
  end if;
  select * into plan from public.plans where id = p_plan for share;
  if not found or not plan.ativo or plan.creditos_mensais <= 0 then
    raise exception 'Plan allowance unavailable' using errcode = 'P0001';
  end if;
  insert into public.plan_credit_grants (user_id, plan_id, cycle_ref, credits)
    values (p_user, p_plan, p_cycle_ref, plan.creditos_mensais) returning * into allowance;
  perform public.apply_credit_delta(p_user, allowance.credits, 'plan_allowance',
    'plan-grant:' || allowance.id::text);
  return allowance;
end;
$$;

revoke all on function public.reserve_credit_action(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.settle_credit_action(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.grant_plan_allowance(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_credit_action(uuid, text, text, text, text, text) to service_role;
grant execute on function public.settle_credit_action(uuid, text, text) to service_role;
grant execute on function public.grant_plan_allowance(uuid, uuid, text) to service_role;

commit;
