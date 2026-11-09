begin;

-- Versão read-only do claim_daily_credits: mesma resposta (saldo, ativo,
-- janela) sem escrever nada e sem FOR UPDATE na wallet. As páginas leem
-- o estado por aqui; a escrita (claim) acontece 1x/dia via middleware.
create or replace function public.daily_credit_state()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_saldo integer;
  v_active boolean;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select saldo into v_saldo from public.credit_wallets where user_id = v_user;
  v_active := not exists (
    select 1 from public.subscriptions
    where user_id = v_user and status in ('active', 'past_due')
  ) and now() <= public.daily_credit_window_start(v_user) + interval '7 days';
  return jsonb_build_object(
    'saldo', coalesce(v_saldo, 0),
    'ativo', v_active,
    'ate', public.daily_credit_window_start(v_user) + interval '7 days'
  );
end;
$$;

revoke all on function public.daily_credit_state() from public, anon;
grant execute on function public.daily_credit_state() to authenticated, service_role;

commit;
