begin;

-- Período de cobrança na assinatura (1/3/12 meses) para exibição no admin
-- e auditoria. Backfill vem do payments.metadata.months do pagamento pago.
alter table public.subscriptions
  add column billing_months integer not null default 1
    check (billing_months between 1 and 24);

update public.subscriptions s
  set billing_months = coalesce((
    select nullif(p.metadata->>'months', '')::integer
    from public.payments p
    where p.user_id = s.user_id
      and p.status = 'paid'
      and p.metadata->>'months' is not null
    order by p.created_at desc
    limit 1), 1);

-- Checkouts de plano abandonados: mantém só o pendente mais recente por
-- usuário; os demais expiram para não ativarem ciclos em dobro se pagos depois.
update public.payments p
  set status = 'expired'
  where p.status = 'pending'
    and p.plan_id is not null
    and p.id <> (
      select p2.id from public.payments p2
      where p2.user_id = p.user_id
        and p2.status = 'pending'
        and p2.plan_id is not null
      order by p2.created_at desc
      limit 1);

-- confirm_plan_payment: grava o período na assinatura e ignora pagamentos
-- que não estão mais pendentes (expirado/falho/estornado não ativa ciclo).
drop function public.confirm_plan_payment(text, text, text, timestamptz, text, integer);
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
  if payment.status <> 'pending' then
    return jsonb_build_object('status', 'ignored', 'reason', payment.status);
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
          cancel_at_period_end = false,
          billing_months = coalesce(p_months, 1)
      where id = subscription.id returning * into subscription;
  else
    insert into public.subscriptions
      (user_id, plan_id, provider, provider_subscription_id, status, current_period_end, billing_months)
      values (payment.user_id, payment.plan_id, p_provider, p_provider_subscription_id,
              'active', p_period_end, coalesce(p_months, 1))
      returning * into subscription;
  end if;

  perform public.grant_plan_allowance(payment.user_id, payment.plan_id, p_cycle_ref, p_months);
  return jsonb_build_object('status', 'activated', 'subscription_id', subscription.id);
end;
$$;
grant execute on function public.confirm_plan_payment(text, text, text, timestamptz, text, integer) to service_role;
revoke all on function public.confirm_plan_payment(text, text, text, timestamptz, text, integer) from public, anon, authenticated;

-- record_renewal_payment: idem na renovação.
drop function public.record_renewal_payment(text, text, text, integer, timestamptz, text, integer);
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
            jsonb_build_object('kind', 'renewal', 'months', coalesce(p_months, 1)))
  on conflict (provider, provider_ref) do nothing;

  update public.subscriptions
    set status = 'active', current_period_end = p_period_end,
        billing_months = coalesce(p_months, subscription.billing_months)
    where id = subscription.id;

  perform public.grant_plan_allowance(subscription.user_id, subscription.plan_id, p_cycle_ref, p_months);
  return jsonb_build_object('status', 'renewed', 'subscription_id', subscription.id);
end;
$$;
grant execute on function public.record_renewal_payment(text, text, text, integer, timestamptz, text, integer) to service_role;
revoke all on function public.record_renewal_payment(text, text, text, integer, timestamptz, text, integer) from public, anon, authenticated;

commit;
