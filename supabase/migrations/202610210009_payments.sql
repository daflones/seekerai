begin;

-- Spina de pagamentos para webhooks dos provedores (Stripe, MercosulPay).
-- Edge functions processam os eventos; toda mutação passa por RPCs service_role.

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (length(provider) between 1 and 60),
  event_id text not null check (length(event_id) between 1 and 300),
  event_type text not null check (length(event_type) between 1 and 150),
  payload jsonb not null,
  attempts integer not null default 1 check (attempts > 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  process_error text,
  unique (provider, event_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  provider text not null check (length(provider) between 1 and 60),
  provider_ref text not null check (length(provider_ref) between 1 and 300),
  method text not null check (method in ('card', 'pix', 'other')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'brl' check (length(currency) = 3),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index payments_user_created_idx on public.payments(user_id, created_at desc);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  provider text not null check (length(provider) between 1 and 60),
  provider_subscription_id text check (provider_subscription_id is null or length(provider_subscription_id) between 1 and 300),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions(user_id);
create unique index subscriptions_provider_sub_uidx
  on public.subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;
-- No máximo uma assinatura ativa por usuário.
create unique index subscriptions_one_active_per_user
  on public.subscriptions(user_id) where status = 'active';
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.webhook_events enable row level security;
alter table public.payments enable row level security;
alter table public.subscriptions enable row level security;

-- Usuário lê apenas o próprio histórico; webhook_events é interno (service role).
create policy payments_select_own on public.payments
  for select to authenticated using (user_id = auth.uid());
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Permite verificação de WhatsApp como ação tarifável (custo definido no admin).
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.credit_action_rules'::regclass and contype = 'c'
  loop
    execute format('alter table public.credit_action_rules drop constraint %I', constraint_name);
  end loop;
end $$;
alter table public.credit_action_rules add constraint credit_action_rules_action_check
  check (action in ('search', 'generate_image', 'generate_site', 'deep_strategy',
                    'sales_reply', 'whatsapp_check'));

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.services_catalog'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%enabled_actions%'
  loop
    execute format('alter table public.services_catalog drop constraint %I', constraint_name);
  end loop;
end $$;
alter table public.services_catalog add constraint services_catalog_enabled_actions_scope
  check (enabled_actions <@ array['search', 'deep_strategy', 'sales_reply',
                                  'generate_site', 'generate_image', 'whatsapp_check']);

insert into public.credit_action_rules (action, cost, enabled) values
  ('whatsapp_check', null, false)
on conflict (action) do nothing;

-- Registra o evento de webhook com deduplicação.
-- Retorna 'new', 'retry' (tentativa anterior falhou) ou 'processed'.
create function public.ingest_webhook_event(
  p_provider text, p_event_id text, p_event_type text, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  event public.webhook_events%rowtype;
begin
  insert into public.webhook_events (provider, event_id, event_type, payload)
    values (p_provider, p_event_id, p_event_type, p_payload)
  on conflict (provider, event_id) do nothing;
  if found then return 'new'; end if;

  select * into event from public.webhook_events
    where provider = p_provider and event_id = p_event_id for update;
  if event.processed_at is not null and event.process_error is null then
    return 'processed';
  end if;
  update public.webhook_events set attempts = attempts + 1 where id = event.id;
  return 'retry';
end;
$$;

create function public.finish_webhook_event(
  p_provider text, p_event_id text, p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.webhook_events
    set processed_at = now(), process_error = p_error
    where provider = p_provider and event_id = p_event_id;
end;
$$;

-- Confirma pagamento de checkout: marca pago, ativa/troca plano e concede
-- créditos do ciclo. O user_id/plan_id sempre vêm da linha criada no checkout
-- — o payload do provedor nunca decide quem recebe o benefício.
create function public.confirm_plan_payment(
  p_provider text,
  p_provider_ref text,
  p_provider_subscription_id text,
  p_period_end timestamptz,
  p_cycle_ref text
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

  perform public.grant_plan_allowance(payment.user_id, payment.plan_id, p_cycle_ref);
  return jsonb_build_object('status', 'activated', 'subscription_id', subscription.id);
end;
$$;

-- Renovação recorrente (ex.: invoice.paid do Stripe): registra o pagamento do
-- ciclo e concede a próxima cota sem recriar a assinatura.
create function public.record_renewal_payment(
  p_provider text,
  p_provider_subscription_id text,
  p_payment_ref text,
  p_amount_cents integer,
  p_period_end timestamptz,
  p_cycle_ref text
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

  perform public.grant_plan_allowance(subscription.user_id, subscription.plan_id, p_cycle_ref);
  return jsonb_build_object('status', 'renewed', 'subscription_id', subscription.id);
end;
$$;

create function public.cancel_provider_subscription(
  p_provider text, p_provider_subscription_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  subscription public.subscriptions%rowtype;
begin
  update public.subscriptions
    set status = 'canceled', cancel_at_period_end = false
    where provider = p_provider and provider_subscription_id = p_provider_subscription_id
      and status <> 'canceled'
    returning * into subscription;
  if not found then
    return jsonb_build_object('status', 'ignored', 'reason', 'unknown_subscription');
  end if;
  return jsonb_build_object('status', 'canceled', 'subscription_id', subscription.id);
end;
$$;

revoke all on function public.ingest_webhook_event(text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.finish_webhook_event(text, text, text)
  from public, anon, authenticated;
revoke all on function public.confirm_plan_payment(text, text, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.record_renewal_payment(text, text, text, integer, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.cancel_provider_subscription(text, text)
  from public, anon, authenticated;
grant execute on function public.ingest_webhook_event(text, text, text, jsonb) to service_role;
grant execute on function public.finish_webhook_event(text, text, text) to service_role;
grant execute on function public.confirm_plan_payment(text, text, text, timestamptz, text) to service_role;
grant execute on function public.record_renewal_payment(text, text, text, integer, timestamptz, text) to service_role;
grant execute on function public.cancel_provider_subscription(text, text) to service_role;

commit;
