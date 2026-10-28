begin;

-- Períodos de cobrança (mensal/trimestral/anual): o ciclo concede
-- creditos_mensais × meses do período. As assinaturas continuam as
-- mesmas — só o tamanho da cota e o vencimento mudam.

drop function public.grant_plan_allowance(uuid, uuid, text);
create or replace function public.grant_plan_allowance(
  p_user uuid, p_plan uuid, p_cycle_ref text, p_months integer default 1
) returns public.plan_credit_grants
language plpgsql security definer set search_path = '' as $$
declare
  allowance public.plan_credit_grants%rowtype;
  plan public.plans%rowtype;
  current_saldo integer;
  credits integer;
  delta integer;
begin
  if p_cycle_ref is null or length(p_cycle_ref) not between 1 and 150 then
    raise exception 'Invalid billing cycle reference' using errcode = '22023';
  end if;
  if p_months is null or p_months not between 1 and 24 then
    raise exception 'Invalid period length' using errcode = '22023';
  end if;
  select saldo into current_saldo from public.credit_wallets
    where user_id = p_user for update;
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
  credits := plan.creditos_mensais * p_months;
  insert into public.plan_credit_grants (user_id, plan_id, cycle_ref, credits)
    values (p_user, p_plan, p_cycle_ref, credits) returning * into allowance;
  -- Zera o que havia e coloca a cota nova do ciclo.
  delta := credits - current_saldo;
  if delta <> 0 then
    perform public.apply_credit_delta(p_user, delta, 'plan_allowance',
      'plan-grant:' || allowance.id::text);
  end if;
  return allowance;
end;
$$;
grant execute on function public.grant_plan_allowance(uuid, uuid, text, integer) to service_role;
revoke all on function public.grant_plan_allowance(uuid, uuid, text, integer) from public, anon, authenticated;

drop function public.confirm_plan_payment(text, text, text, timestamptz, text);
create or replace function public.confirm_plan_payment(
  p_provider text,
  p_provider_ref text,
  p_provider_subscription_id text,
  p_period_end timestamptz,
  p_cycle_ref text,
  p_months integer default 1
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  payment public.payments%rowtype;
  subscription public.subscriptions%rowtype;
begin
  if p_cycle_ref is null or length(p_cycle_ref) not between 1 and 150 then
    raise exception 'Invalid cycle reference' using errcode = '22023';
  end if;

  select * into payment from public.payments
    where provider = p_provider and provider_ref = p_provider_ref for update;
  if not found then
    return jsonb_build_object('status', 'ignored', 'reason', 'unknown_payment');
  end if;
  if payment.status = 'paid' then
    return jsonb_build_object('status', 'duplicate');
  end if;

  update public.payments set status = 'paid' where id = payment.id;

  select * into subscription from public.subscriptions
    where user_id = payment.user_id and status in ('pending', 'active', 'past_due')
    order by created_at desc limit 1 for update;
  if found then
    update public.subscriptions
      set plan_id = payment.plan_id,
          provider = p_provider,
          provider_subscription_id = coalesce(p_provider_subscription_id, subscription.provider_subscription_id),
          status = 'active',
          current_period_end = p_period_end,
          cancel_at_period_end = false
      where id = subscription.id returning * into subscription;
  else
    insert into public.subscriptions
      (user_id, plan_id, provider, provider_subscription_id, status, current_period_end)
      values (payment.user_id, payment.plan_id, p_provider, p_provider_subscription_id,
              'active', p_period_end)
      returning * into subscription;
  end if;

  perform public.grant_plan_allowance(payment.user_id, payment.plan_id, p_cycle_ref, p_months);
  return jsonb_build_object('status', 'activated', 'subscription_id', subscription.id);
end;
$$;
grant execute on function public.confirm_plan_payment(text, text, text, timestamptz, text, integer) to service_role;
revoke all on function public.confirm_plan_payment(text, text, text, timestamptz, text, integer) from public, anon, authenticated;

drop function public.record_renewal_payment(text, text, text, integer, timestamptz, text);
create or replace function public.record_renewal_payment(
  p_provider text,
  p_provider_subscription_id text,
  p_payment_ref text,
  p_amount_cents integer,
  p_period_end timestamptz,
  p_cycle_ref text,
  p_months integer default 1
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  subscription public.subscriptions%rowtype;
begin
  if p_cycle_ref is null or length(p_cycle_ref) not between 1 and 150 then
    raise exception 'Invalid cycle reference' using errcode = '22023';
  end if;

  select * into subscription from public.subscriptions
    where provider = p_provider and provider_subscription_id = p_provider_subscription_id
      and status in ('active', 'past_due') for update;
  if not found then
    return jsonb_build_object('status', 'ignored', 'reason', 'unknown_subscription');
  end if;

  insert into public.payments (user_id, plan_id, provider, provider_ref, method,
                               amount_cents, status, metadata)
    values (subscription.user_id, subscription.plan_id, p_provider, p_payment_ref,
            'other', coalesce(p_amount_cents, 0), 'paid',
            jsonb_build_object('kind', 'renewal'))
  on conflict (provider, provider_ref) do nothing;

  update public.subscriptions
    set status = 'active', current_period_end = p_period_end
    where id = subscription.id;

  perform public.grant_plan_allowance(subscription.user_id, subscription.plan_id, p_cycle_ref, p_months);
  return jsonb_build_object('status', 'renewed', 'subscription_id', subscription.id);
end;
$$;
grant execute on function public.record_renewal_payment(text, text, text, integer, timestamptz, text, integer) to service_role;
revoke all on function public.record_renewal_payment(text, text, text, integer, timestamptz, text, integer) from public, anon, authenticated;

commit;
