begin;

-- Preços internacionais por plano (centavos de USD/EUR/GBP), configuráveis
-- no admin. Chave ausente = plano não é vendido naquela moeda.
alter table public.plans
  add column intl_prices jsonb not null default '{}'::jsonb;

create function public.valid_intl_prices(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  item record;
begin
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  for item in select e.key as k, e.value as v from jsonb_each(value) as e loop
    if item.k not in ('usd','eur','gbp') then return false; end if;
    if jsonb_typeof(item.v) is distinct from 'number'
      or (item.v #>> '{}')::numeric <> trunc((item.v #>> '{}')::numeric)
      or (item.v #>> '{}')::numeric not between 1 and 10000000 then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.plans
  add constraint plans_intl_prices_valid check (public.valid_intl_prices(intl_prices));

-- Seed: mesmos valores que o INTL_PRICES fixo (USD/EUR iguais), GBP ~20% menor.
update public.plans set intl_prices = case slug
  when 'essencial' then '{"usd":500,"eur":500,"gbp":400}'::jsonb
  when 'pro'       then '{"usd":1500,"eur":1500,"gbp":1200}'::jsonb
  when 'king'      then '{"usd":2500,"eur":2500,"gbp":2000}'::jsonb
  else '{}'::jsonb end
where slug in ('essencial','pro','king');

-- View pública passa a expor os preços internacionais (drop+create: o
-- OR REPLACE não permite inserir coluna no meio da lista).
drop view public.public_plan_cards;
create view public.public_plan_cards with (security_invoker = true) as
  select id, slug, nome, preco_centavos, intl_prices, ordem, destaque, card_content, card_revision
  from public.plans where landing_visible;
revoke all on public.public_plan_cards from anon, authenticated;
grant select on public.public_plan_cards to anon, authenticated, service_role;
grant select (intl_prices) on public.plans to anon;

-- configure_plan_card ganha p_intl (preços por moeda). Assinatura nova —
-- a antiga é removida pra não criar sobrecarga ambígua.
drop function public.configure_plan_card(uuid,text,integer,integer,boolean,boolean,jsonb,integer,text);
create function public.configure_plan_card(
  p_plan uuid, p_name text, p_price integer, p_order integer, p_featured boolean,
  p_visible boolean, p_content jsonb, p_revision integer, p_reason text, p_intl jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous public.plans%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 60 or not public.plan_marketing_text_allowed(p_name)
    or p_price is null or p_price not between 0 and 10000000 or p_order is null or p_order not between 0 and 99
    or p_featured is null or p_visible is null or p_revision is null or p_revision < 0
    or not public.valid_plan_card(p_content) or p_reason is null or length(trim(p_reason)) not between 5 and 300
    or p_intl is null or not public.valid_intl_prices(p_intl) then
    raise exception 'Invalid plan card configuration' using errcode = '22023';
  end if;
  select * into previous from public.plans where id = p_plan for update;
  if not found then raise exception 'Plan not found' using errcode = 'P0002'; end if;
  if previous.card_revision <> p_revision then
    raise exception 'Plan card was modified by another request' using errcode = '40001';
  end if;
  if previous.slug = 'gratis' and p_price <> 0 then raise exception 'Free plan must remain free' using errcode = '22023'; end if;
  update public.plans set nome = trim(p_name), preco_centavos = p_price, ordem = p_order,
    destaque = p_featured, landing_visible = p_visible, card_content = p_content,
    intl_prices = p_intl,
    card_revision = card_revision + 1 where id = p_plan;
  insert into public.audit_log (ator, acao, alvo, diff)
    values (auth.uid(), 'plan_card.updated', p_plan::text, jsonb_build_object(
      'reason', p_reason,
      'before', jsonb_build_object('name', previous.nome, 'price', previous.preco_centavos,
        'intl_prices', previous.intl_prices,
        'order', previous.ordem, 'featured', previous.destaque, 'visible', previous.landing_visible,
        'content', previous.card_content, 'revision', previous.card_revision),
      'after', jsonb_build_object('name', trim(p_name), 'price', p_price, 'intl_prices', p_intl,
        'order', p_order, 'featured', p_featured, 'visible', p_visible, 'content', p_content,
        'revision', p_revision + 1)
    ));
end;
$$;
revoke all on function public.configure_plan_card(uuid,text,integer,integer,boolean,boolean,jsonb,integer,text,jsonb) from public, anon;
grant execute on function public.configure_plan_card(uuid,text,integer,integer,boolean,boolean,jsonb,integer,text,jsonb) to authenticated;
revoke all on function public.valid_intl_prices(jsonb) from public, anon, authenticated;
grant execute on function public.valid_intl_prices(jsonb) to service_role;

-- Moeda da assinatura: checkout grava no pagamento; a confirmação copia.
alter table public.subscriptions
  add column currency text not null default 'brl' check (currency in ('brl','usd','eur','gbp'));

-- Backfill: payments.currency existia mas nunca era escrita — o valor real
-- está em metadata.currency. Corrige antes de qualquer leitura financeira.
update public.payments
  set currency = lower(metadata ->> 'currency')
  where metadata ->> 'currency' in ('brl','usd','eur','gbp')
    and currency <> lower(metadata ->> 'currency');

-- Assinaturas ativas herdam a moeda do último pagamento confirmado.
update public.subscriptions s set currency = coalesce((
    select p.currency from public.payments p
    where p.user_id = s.user_id and p.plan_id = s.plan_id and p.status = 'paid'
    order by p.created_at desc limit 1
  ), 'brl')
where s.status in ('active','past_due');

-- confirm_plan_payment (versão atual + moeda): propaga a moeda do
-- pagamento pra assinatura. Mantém p_months e a regra de revisão manual.
drop function public.confirm_plan_payment(text, text, text, timestamptz, text, integer);
create function public.confirm_plan_payment(
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
  pay_currency text;
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
  pay_currency := lower(coalesce(nullif(payment.metadata ->> 'currency', ''), payment.currency, 'brl'));

  select * into subscription from public.subscriptions
    where user_id = payment.user_id and status in ('pending', 'active', 'past_due')
    order by created_at desc limit 1 for update;
  if found then
    update public.subscriptions
      set plan_id = payment.plan_id,
          provider = p_provider,
          provider_subscription_id = coalesce(p_provider_subscription_id, subscription.provider_subscription_id),
          status = 'active',
          currency = pay_currency,
          current_period_end = p_period_end,
          cancel_at_period_end = false,
          billing_months = coalesce(p_months, 1)
      where id = subscription.id returning * into subscription;
  else
    insert into public.subscriptions
      (user_id, plan_id, provider, provider_subscription_id, status, current_period_end, billing_months, currency)
      values (payment.user_id, payment.plan_id, p_provider, p_provider_subscription_id,
              'active', p_period_end, coalesce(p_months, 1), pay_currency)
      returning * into subscription;
  end if;

  perform public.grant_plan_allowance(payment.user_id, payment.plan_id, p_cycle_ref, p_months);
  return jsonb_build_object('status', 'activated', 'subscription_id', subscription.id);
end;
$$;
grant execute on function public.confirm_plan_payment(text, text, text, timestamptz, text, integer) to service_role;
revoke all on function public.confirm_plan_payment(text, text, text, timestamptz, text, integer) from public, anon, authenticated;

-- Renovação: novo parâmetro p_currency (Stripe invoice traz object.currency).
-- Sem p_currency, herda a moeda da assinatura.
drop function public.record_renewal_payment(text, text, text, integer, timestamptz, text, integer);
create function public.record_renewal_payment(
  p_provider text,
  p_provider_subscription_id text,
  p_payment_ref text,
  p_amount_cents integer,
  p_period_end timestamptz,
  p_cycle_ref text,
  p_months integer default 1,
  p_currency text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  subscription public.subscriptions%rowtype;
  pay_currency text;
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
  pay_currency := lower(coalesce(nullif(p_currency, ''), subscription.currency, 'brl'));

  insert into public.payments (user_id, plan_id, provider, provider_ref, method,
                               amount_cents, currency, status, metadata)
    values (subscription.user_id, subscription.plan_id, p_provider, p_payment_ref,
            'other', coalesce(p_amount_cents, 0), pay_currency, 'paid',
            jsonb_build_object('kind', 'renewal', 'months', coalesce(p_months, 1), 'currency', pay_currency))
  on conflict (provider, provider_ref) do nothing;

  update public.subscriptions
    set status = 'active', current_period_end = p_period_end,
        billing_months = coalesce(p_months, subscription.billing_months),
        currency = pay_currency
    where id = subscription.id;

  perform public.grant_plan_allowance(subscription.user_id, subscription.plan_id, p_cycle_ref, p_months);
  return jsonb_build_object('status', 'renewed', 'subscription_id', subscription.id);
end;
$$;

revoke all on function public.record_renewal_payment(text, text, text, integer, timestamptz, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_renewal_payment(text, text, text, integer, timestamptz, text, integer, text)
  to service_role;

commit;
