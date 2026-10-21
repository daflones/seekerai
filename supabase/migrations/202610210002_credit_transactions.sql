begin;

create function public.apply_credit_delta(
  p_user uuid, p_delta integer, p_motivo text, p_ref text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  current_balance integer;
  prior public.credit_ledger%rowtype;
  next_balance integer;
begin
  if p_delta is null or p_delta = 0 or p_ref is null or length(p_ref) not between 1 and 300
    or p_motivo is null or length(p_motivo) not between 1 and 300 then
    raise exception 'Invalid credit operation' using errcode = '22023';
  end if;

  -- Serialize all movements for this wallet, including idempotency checks.
  select saldo into current_balance from public.credit_wallets
    where user_id = p_user for update;
  if not found then
    raise exception 'Wallet not found' using errcode = 'P0002';
  end if;

  select * into prior from public.credit_ledger
    where user_id = p_user and ref = p_ref;
  if found then
    if prior.delta <> p_delta or prior.motivo <> p_motivo then
      raise exception 'Idempotency reference conflict' using errcode = '22023';
    end if;
    return prior.saldo_apos;
  end if;

  next_balance := current_balance + p_delta;
  if next_balance < 0 then
    raise exception 'Insufficient credits' using errcode = 'P0001';
  end if;
  insert into public.credit_ledger (user_id, delta, saldo_apos, motivo, ref)
    values (p_user, p_delta, next_balance, p_motivo, p_ref);
  update public.credit_wallets set saldo = next_balance where user_id = p_user;
  return next_balance;
end;
$$;

create function public.consume_credits(
  p_user uuid, p_qtd integer, p_motivo text, p_ref text
) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if p_qtd is null or p_qtd <= 0 then
    raise exception 'Quantity must be positive' using errcode = '22023';
  end if;
  return public.apply_credit_delta(p_user, -p_qtd, p_motivo, p_ref);
end;
$$;

revoke all on function public.apply_credit_delta(uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.consume_credits(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_credit_delta(uuid, integer, text, text) to service_role;
grant execute on function public.consume_credits(uuid, integer, text, text) to service_role;

commit;
