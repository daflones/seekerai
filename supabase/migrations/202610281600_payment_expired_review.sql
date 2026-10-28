begin;

-- Cobrança expirada/falha que acaba paga depois (PIX escaneado tarde):
-- registra como paga e sinaliza revisão manual no audit_log, sem ativar
-- ciclo nem liberar cota — o financeiro decide estorno ou crédito manual.
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
    update public.payments set status = 'paid' where id = payment.id;
    insert into public.audit_log (ator, acao, alvo, diff)
      values (payment.user_id, 'payment.paid_after_expiry', payment.id::text,
        jsonb_build_object('provider', p_provider, 'provider_ref', p_provider_ref,
          'previous_status', payment.status, 'amount_cents', payment.amount_cents,
          'plan_id', payment.plan_id));
    return jsonb_build_object('status', 'manual_review', 'reason', payment.status);
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

commit;
