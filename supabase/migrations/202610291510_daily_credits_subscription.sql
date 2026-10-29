begin;

-- A cota diária é pra quem NÃO tem plano ativo — quem comprou pack
-- avulso ou cancelou assinatura continua recebendo (reengajamento),
-- sem punir quem já pagou alguma vez.
create or replace function public.daily_credit_topup(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_saldo integer;
  v_ref text;
  v_delta integer;
begin
  if exists (
    select 1 from public.subscriptions
    where user_id = p_user and status in ('active', 'past_due')
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

commit;
