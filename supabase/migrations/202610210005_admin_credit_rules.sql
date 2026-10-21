begin;

create function public.configure_credit_action(
  p_action text, p_cost integer, p_enabled boolean, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old_rule public.credit_action_rules%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 300 or
    p_enabled is null or (p_enabled and p_cost is null) or
    (p_cost is not null and (p_cost < 1 or p_cost > 1000000)) then
    raise exception 'Invalid pricing configuration' using errcode = '22023';
  end if;
  select * into old_rule from public.credit_action_rules where action = p_action for update;
  if not found then raise exception 'Unknown action' using errcode = '22023'; end if;
  update public.credit_action_rules set cost = p_cost, enabled = p_enabled where action = p_action;
  insert into public.audit_log (ator, acao, alvo, diff)
    values (auth.uid(), 'credit_rule.updated', p_action,
      jsonb_build_object('reason', p_reason, 'before', jsonb_build_object('cost', old_rule.cost, 'enabled', old_rule.enabled),
        'after', jsonb_build_object('cost', p_cost, 'enabled', p_enabled)));
end;
$$;

create function public.configure_welcome_credits(p_credits integer, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  old_bonus integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_credits is null or p_credits not between 0 and 1000000 or
    p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'Invalid welcome bonus configuration' using errcode = '22023';
  end if;
  select welcome_credits into strict old_bonus from public.credit_settings where singleton for update;
  update public.credit_settings set welcome_credits = p_credits where singleton;
  insert into public.audit_log (ator, acao, alvo, diff)
    values (auth.uid(), 'welcome_credits.updated', 'credit_settings',
      jsonb_build_object('reason', p_reason, 'before', old_bonus, 'after', p_credits));
end;
$$;

create function public.configure_plan_credits(p_plan uuid, p_credits integer, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  old_credits integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_credits is null or p_credits not between 0 and 1000000 or
    p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'Invalid plan allowance configuration' using errcode = '22023';
  end if;
  select creditos_mensais into old_credits from public.plans where id = p_plan for update;
  if not found then raise exception 'Plan not found' using errcode = 'P0002'; end if;
  update public.plans set creditos_mensais = p_credits where id = p_plan;
  insert into public.audit_log (ator, acao, alvo, diff)
    values (auth.uid(), 'plan_credits.updated', p_plan::text,
      jsonb_build_object('reason', p_reason, 'before', old_credits, 'after', p_credits));
end;
$$;

revoke all on function public.configure_credit_action(text, integer, boolean, text) from public, anon;
revoke all on function public.configure_welcome_credits(integer, text) from public, anon;
revoke all on function public.configure_plan_credits(uuid, integer, text) from public, anon;
grant execute on function public.configure_credit_action(text, integer, boolean, text) to authenticated;
grant execute on function public.configure_welcome_credits(integer, text) to authenticated;
grant execute on function public.configure_plan_credits(uuid, integer, text) to authenticated;

commit;
