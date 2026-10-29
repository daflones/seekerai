begin;

-- Fim do modelo gratuito: sem créditos de boas-vindas e sem cota
-- diária. Quem não assina cai no paywall na primeira ação.
update public.credit_settings set welcome_credits = 0 where singleton;

-- Mantida como no-op: reserve_credit_action ainda a chama internamente.
create or replace function public.daily_credit_topup(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  return;
end;
$$;

-- As páginas chamam pra saber se a renovação diária vale — agora
-- sempre falso, então a UI mostra o paywall direto.
create or replace function public.claim_daily_credits()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_saldo integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  select saldo into v_saldo from public.credit_wallets where user_id = v_user;
  return jsonb_build_object(
    'saldo', coalesce(v_saldo, 0),
    'ativo', false,
    'ate', null
  );
end;
$$;

commit;
