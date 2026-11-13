begin;

-- Alinha a versão read-only ao fim do modelo gratuito: sem janela de
-- 7 dias, sem renovação diária — a UI nunca mais promete "volta amanhã".
create or replace function public.daily_credit_state()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
