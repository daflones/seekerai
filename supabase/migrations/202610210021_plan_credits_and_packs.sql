begin;

-- 1. Cota mensal por plano: Essencial 50, Pro 125, King 250.
update public.plans set creditos_mensais = case slug
  when 'essencial' then 50
  when 'pro' then 125
  when 'king' then 250
  else creditos_mensais
end;

-- 2. Pagamento avulso (pacote de créditos) não tem plano.
alter table public.payments alter column plan_id drop not null;

-- 3. Site e imagem liberados para TODOS os serviços — qualquer prestador
--    pode gerar material pro lead, não só designer/dev.
update public.services_catalog
  set enabled_actions = array['search', 'deep_strategy', 'sales_reply',
                              'generate_site', 'generate_image', 'whatsapp_check', 'lead_assist']
  where ativo;

-- 4. Renovação RESETA o saldo para a cota do ciclo (não acumula).
create or replace function public.grant_plan_allowance(
  p_user uuid, p_plan uuid, p_cycle_ref text
) returns public.plan_credit_grants
language plpgsql security definer set search_path = '' as $$
declare
  allowance public.plan_credit_grants%rowtype;
  plan public.plans%rowtype;
  current_saldo integer;
  delta integer;
begin
  if p_cycle_ref is null or length(p_cycle_ref) not between 1 and 150 then
    raise exception 'Invalid billing cycle reference' using errcode = '22023';
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
  insert into public.plan_credit_grants (user_id, plan_id, cycle_ref, credits)
    values (p_user, p_plan, p_cycle_ref, plan.creditos_mensais) returning * into allowance;
  -- Zera o que havia e coloca a cota nova do ciclo.
  delta := plan.creditos_mensais - current_saldo;
  if delta <> 0 then
    perform public.apply_credit_delta(p_user, delta, 'plan_allowance',
      'plan-grant:' || allowance.id::text);
  end if;
  return allowance;
end;
$$;

revoke all on function public.grant_plan_allowance(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.grant_plan_allowance(uuid, uuid, text) to service_role;

-- 5. Pacote avulso de créditos (ex.: +50 por R$20): marca pago e SOMA ao
--    saldo — pacote comprado não zera nada.
create function public.confirm_credit_pack_payment(
  p_provider text, p_provider_ref text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  payment public.payments%rowtype;
  credits integer;
begin
  select * into payment from public.payments
    where provider = p_provider and provider_ref = p_provider_ref for update;
  if not found then
    return jsonb_build_object('status', 'ignored', 'reason', 'unknown_payment');
  end if;
  if payment.status = 'paid' then
    return jsonb_build_object('status', 'duplicate');
  end if;
  credits := coalesce((payment.metadata ->> 'credits')::integer, 0);
  if credits <= 0 then
    raise exception 'Credit pack without credits' using errcode = '22023';
  end if;
  update public.payments set status = 'paid' where id = payment.id;
  perform public.apply_credit_delta(payment.user_id, credits, 'credit_pack',
    'pack:' || payment.id::text);
  return jsonb_build_object('status', 'credited', 'credits', credits);
end;
$$;

revoke all on function public.confirm_credit_pack_payment(text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_credit_pack_payment(text, text) to service_role;

commit;
