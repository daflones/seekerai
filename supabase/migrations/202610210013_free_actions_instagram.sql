begin;

-- Ações gratuitas (custo 0): a operação continua registrada p/ idempotência,
-- mas nenhum delta entra no ledger (delta não pode ser 0).
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.credit_action_rules'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%cost%'
  loop
    execute format('alter table public.credit_action_rules drop constraint %I', constraint_name);
  end loop;
end $$;
alter table public.credit_action_rules
  add constraint credit_action_rules_cost_check check (cost between 0 and 1000000),
  add constraint credit_action_rules_cost_required check (not enabled or cost is not null);

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.credit_operations'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%cost%'
  loop
    execute format('alter table public.credit_operations drop constraint %I', constraint_name);
  end loop;
end $$;
alter table public.credit_operations
  add constraint credit_operations_cost_check check (cost >= 0);

create or replace function public.reserve_credit_action(
  p_user uuid, p_action text, p_business_ref text,
  p_service text, p_input_hash text, p_request_ref text
) returns public.credit_operations
language plpgsql security definer set search_path = '' as $$
declare
  operation public.credit_operations%rowtype;
  rule public.credit_action_rules%rowtype;
begin
  if p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' then
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
  if operation.cost > 0 then
    perform public.consume_credits(p_user, operation.cost, 'action:' || p_action,
      'operation:' || operation.id::text || ':reserve');
  end if;
  return operation;
end;
$$;

create or replace function public.settle_credit_action(
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
  if p_outcome = 'refunded' and operation.cost > 0 then
    perform public.apply_credit_delta(p_user, operation.cost, 'refund:' || operation.action,
      'operation:' || operation.id::text || ':refund');
  end if;
  update public.credit_operations set status = p_outcome
    where id = operation.id returning * into operation;
  return operation;
end;
$$;

-- Grátis: mensagem de abordagem e verificação de WhatsApp.
update public.credit_action_rules set enabled = true, cost = 0 where action in ('sales_reply', 'whatsapp_check');

-- Instagram separado do site.
alter table public.leads
  add column instagram text check (char_length(instagram) <= 200);

-- Saídas de imagem podem chegar a alguns MB (data URL base64).
alter table public.lead_outputs drop constraint if exists lead_outputs_conteudo_check;
alter table public.lead_outputs
  add constraint lead_outputs_conteudo_check check (char_length(conteudo) between 1 and 8000000);

-- Serviços de imagem ganham o gerador (prompt próprio do usuário).
update public.services_catalog
  set enabled_actions = array_append(enabled_actions, 'generate_image')
  where slug in ('fotografia', 'edicao_video', 'gravacao_video')
    and not ('generate_image' = any(enabled_actions));

-- Verificação de WhatsApp disponível para qualquer serviço vendido.
update public.services_catalog
  set enabled_actions = array_append(enabled_actions, 'whatsapp_check')
  where not ('whatsapp_check' = any(enabled_actions));

commit;
