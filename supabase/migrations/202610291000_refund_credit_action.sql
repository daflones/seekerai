begin;

-- Estorno tolerante para o orquestrador web: quando a edge morre sem
-- liquidar a reserva (crash, timeout, deploy), a rota que marca o job
-- como erro chama esta função. Só devolve se ainda estiver 'reserved' —
-- nunca estorna uma operação concluída ou já estornada.
create function public.refund_credit_action(
  p_user uuid, p_request_ref text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  operation public.credit_operations%rowtype;
begin
  select * into operation from public.credit_operations
    where user_id = p_user and request_ref = p_request_ref for update;
  if not found then
    return jsonb_build_object('status', 'ignored', 'reason', 'not_found');
  end if;
  if operation.status <> 'reserved' then
    return jsonb_build_object('status', 'ignored', 'reason', operation.status);
  end if;
  if operation.cost > 0 then
    perform public.apply_credit_delta(p_user, operation.cost, 'refund:' || operation.action,
      'operation:' || operation.id::text || ':refund');
  end if;
  update public.credit_operations set status = 'refunded' where id = operation.id;
  return jsonb_build_object('status', 'refunded', 'cost', operation.cost,
    'action', operation.action);
end;
$$;
grant execute on function public.refund_credit_action(uuid, text) to service_role;
revoke all on function public.refund_credit_action(uuid, text) from public, anon, authenticated;

-- O orquestrador precisa do requestRef pra estornar jobs que expiraram.
alter table public.ai_jobs add column request_ref text;

commit;
