begin;

-- Provisionamento semi-automático de domínios: o app cria a zona no
-- Cloudflare + registros DNS, mostra os nameservers pro admin delegar no
-- registro.br (único passo manual) e ativa sozinho quando a delegação
-- propagar — anexando o host ao serviço do EasyPanel.

alter table public.domains
  add column if not exists cf_zone_id text,
  add column if not exists cf_nameservers text[],
  add column if not exists setup_error text;

-- Admin: grava resultado do provisionamento (zona CF + nameservers) ou o
-- erro da última tentativa, sem mudar o status do pedido.
create function public.admin_domain_set_provision(
  p_domain uuid, p_zone_id text, p_nameservers text[], p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  update public.domains
    set cf_zone_id = p_zone_id, cf_nameservers = p_nameservers, setup_error = p_error
    where id = p_domain;
  if not found then raise exception 'Domain not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.admin_domain_set_provision(uuid, text, text[], text) from public, anon;
grant execute on function public.admin_domain_set_provision(uuid, text, text[], text) to authenticated;

-- Mesma RPC de gestão, agora aceitando service_role — o cron ativa o
-- domínio pelo mesmo caminho auditado quando a delegação propaga.
create or replace function public.admin_manage_domain(
  p_domain uuid, p_action text, p_host text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  domain public.domains%rowtype;
  clean_host text;
begin
  if not (public.is_admin() or (select auth.jwt() ->> 'role') = 'service_role') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into domain from public.domains where id = p_domain for update;
  if not found then raise exception 'Domain not found' using errcode = 'P0002'; end if;

  if p_action = 'activate' then
    clean_host := lower(trim(coalesce(p_host, domain.desired_host)));
    clean_host := regexp_replace(clean_host, '^www\.', '');
    if clean_host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
      raise exception 'Invalid host' using errcode = '22023';
    end if;
    if domain.status not in ('pending_setup', 'active', 'pending_payment') then
      raise exception 'Domain is not activatable' using errcode = '22023';
    end if;
    update public.domains
      set host = clean_host, status = 'active', setup_error = null,
          activated_at = now(), expires_at = now() + interval '1 year'
      where id = domain.id returning * into domain;
    insert into public.notifications (user_id, tipo, titulo, corpo)
      values (domain.user_id, 'dominio',
        'Seu domínio está no ar',
        domain.host || ' já aponta para seu site. A anuidade vale até ' ||
        to_char(domain.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.');
  elsif p_action = 'reject' then
    if domain.status in ('rejected', 'removed') then
      raise exception 'Domain already closed' using errcode = '22023';
    end if;
    update public.domains set status = 'rejected' where id = domain.id
      returning * into domain;
    insert into public.notifications (user_id, tipo, titulo, corpo)
      values (domain.user_id, 'dominio',
        'Domínio não ativado',
        'Não foi possível ativar ' || domain.desired_host ||
        coalesce(': ' || p_reason || '.', '.') || ' Fale com o suporte se tiver dúvidas.');
  elsif p_action = 'remove' then
    if domain.status = 'removed' then
      raise exception 'Domain already removed' using errcode = '22023';
    end if;
    update public.domains set status = 'removed' where id = domain.id
      returning * into domain;
    insert into public.notifications (user_id, tipo, titulo, corpo)
      values (domain.user_id, 'dominio',
        'Domínio removido',
        coalesce(domain.host, domain.desired_host) ||
        ' não aponta mais para seu site.');
  elsif p_action = 'renew' then
    if domain.status <> 'active' then
      raise exception 'Only active domains can be renewed' using errcode = '22023';
    end if;
    update public.domains
      set expires_at = greatest(coalesce(expires_at, now()), now()) + interval '1 year'
      where id = domain.id returning * into domain;
    insert into public.notifications (user_id, tipo, titulo, corpo)
      values (domain.user_id, 'dominio',
        'Domínio renovado',
        domain.host || ' agora vale até ' ||
        to_char(domain.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.');
  else
    raise exception 'Unknown domain action' using errcode = '22023';
  end if;

  insert into public.audit_log (ator, acao, alvo, diff)
    values ((select auth.uid()), 'domain.' || p_action, domain.id::text,
      jsonb_build_object('host', domain.host, 'desired_host', domain.desired_host,
        'user_id', domain.user_id, 'reason', p_reason));
  return jsonb_build_object('status', domain.status, 'host', domain.host,
    'expires_at', domain.expires_at);
end;
$$;
revoke all on function public.admin_manage_domain(uuid, text, text, text) from public, anon;
grant execute on function public.admin_manage_domain(uuid, text, text, text) to authenticated, service_role;

-- A cada 15min: cria zonas CF pendentes e ativa domínios cuja delegação
-- já propagou pro Cloudflare.
select cron.unschedule(jobid) from cron.job where jobname = 'seekerai-domain-provision';
select cron.schedule(
  'seekerai-domain-provision', '*/15 * * * *',
  $job$
    select net.http_get(
      url := 'https://seekerai.digital/api/cron/provision-domains',
      headers := jsonb_build_object(
        'x-internal-key',
        (select value from public.internal_kv where key = 'cron_auth')
      ),
      timeout_milliseconds := 120000
    )
  $job$
);

commit;
