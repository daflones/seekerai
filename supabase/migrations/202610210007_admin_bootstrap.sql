begin;

create function public.grant_admin_access(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous_role text;
begin
  select role into previous_role from public.profiles where id = p_user for update;
  if not found then raise exception 'Profile not provisioned' using errcode = 'P0002'; end if;
  if previous_role = 'admin' then return; end if;
  update public.profiles set role = 'admin' where id = p_user;
  insert into public.audit_log (ator, acao, alvo, diff)
    values (p_user, 'admin.bootstrap', p_user::text,
      jsonb_build_object('before', previous_role, 'after', 'admin', 'source', 'trusted_setup'));
end;
$$;
revoke all on function public.grant_admin_access(uuid) from public, anon, authenticated;
grant execute on function public.grant_admin_access(uuid) to service_role;

commit;
