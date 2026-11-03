begin;

-- Serviços internos (prefixo "_", ex.: "_editor" usado pelo assistente do
-- editor visual) não são nichos do radar — pulam a validação de catálogo
-- mas seguem reserva/idempotência/cobrança normais.
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
  if left(p_service, 1) <> '_' and not exists (
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
  -- Ação gratuita (cost 0): registra a operação pra idempotência sem
  -- lançar delta no ledger (consume_credits exige quantidade > 0).
  if operation.cost > 0 then
    perform public.consume_credits(p_user, operation.cost, 'action:' || p_action,
      'operation:' || operation.id::text || ':reserve');
  end if;
  return operation;
end;
$$;

commit;
