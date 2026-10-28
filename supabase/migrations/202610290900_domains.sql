begin;

-- Domínio próprio para sites publicados: o usuário pede o host, paga a
-- anuidade e o admin configura manualmente em até 48h. O middleware do
-- app resolve host → slug pela view pública active_domains.
create table public.domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  site_slug text not null references public.sites(slug) on delete cascade,
  desired_host text not null
    check (desired_host ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  host text
    check (host is null or host ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'pending_setup', 'active', 'rejected', 'removed')),
  price_cents integer not null check (price_cents between 0 and 1000000),
  payment_id uuid references public.payments(id) on delete set null,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index domains_user_idx on public.domains(user_id);
create index domains_site_idx on public.domains(site_slug);
-- Um domínio "vivo" por site (pagamento pendente, configuração ou ativo).
create unique index domains_one_live_per_site on public.domains(site_slug)
  where status in ('pending_payment', 'pending_setup', 'active');
-- Host ativo é único globalmente; removido/rejeitado libera o nome.
create unique index domains_active_host_uidx on public.domains(host)
  where status = 'active' and host is not null;
create trigger domains_updated_at before update on public.domains
  for each row execute function public.set_updated_at();

alter table public.domains enable row level security;
create policy domains_select_own on public.domains
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
grant select on public.domains to authenticated;
grant all on public.domains to service_role;

-- Notificações in-app (WhatsApp continua desligado — o aviso é aqui).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (length(tipo) between 1 and 40),
  titulo text not null check (length(titulo) between 1 and 200),
  corpo text check (corpo is null or length(corpo) <= 1000),
  lida boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, lida, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- Resolução pública host → slug (dado público: o site já é público).
create view public.active_domains as
  select d.host, d.site_slug as slug
  from public.domains d
  join public.sites s on s.slug = d.site_slug
  where d.status = 'active' and d.host is not null and s.publicado;
grant select on public.active_domains to anon, authenticated, service_role;

-- Preço anual do domínio, editável pelo admin (padrão R$ 69,99).
insert into public.app_settings (key, value)
  values ('domain_price_cents', '6999'::jsonb)
  on conflict (key) do nothing;

-- Libera domain_price_cents no configure_app_setting existente.
create or replace function public.configure_app_setting(
  p_key text, p_value jsonb, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'Reason required (5-300 chars)' using errcode = '22023';
  end if;
  if p_key not in ('search_provider', 'domain_price_cents') then
    raise exception 'Unknown setting key' using errcode = '22023';
  end if;
  if p_key = 'search_provider' and
    (jsonb_typeof(p_value) <> 'string' or
     p_value #>> '{}' not in ('google_places', 'apify')) then
    raise exception 'Invalid provider value' using errcode = '22023';
  end if;
  if p_key = 'domain_price_cents' and
    (jsonb_typeof(p_value) <> 'number' or
     (p_value #>> '{}')::numeric < 500 or (p_value #>> '{}')::numeric > 1000000) then
    raise exception 'Invalid domain price' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_by)
    values (p_key, p_value, (select auth.uid()))
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (ator, acao, alvo, diff)
    values ((select auth.uid()), 'app_setting:update', p_key,
            jsonb_build_object('value', p_value, 'reason', p_reason));
end;
$$;
revoke all on function public.configure_app_setting(text, jsonb, text) from public, anon;
grant execute on function public.configure_app_setting(text, jsonb, text) to authenticated, service_role;

-- Confirmação do pagamento do domínio (webhooks). Pagamento confirmado →
-- domínio vai para pending_setup: a ativação é manual pelo admin.
create function public.confirm_domain_payment(
  p_provider text, p_provider_ref text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  payment public.payments%rowtype;
  domain public.domains%rowtype;
begin
  select * into payment from public.payments
    where provider = p_provider and provider_ref = p_provider_ref for update;
  if not found then
    return jsonb_build_object('status', 'ignored', 'reason', 'unknown_payment');
  end if;
  if payment.status = 'paid' then
    return jsonb_build_object('status', 'duplicate');
  end if;
  select * into domain from public.domains
    where id = (payment.metadata->>'domain_id')::uuid for update;
  if not found then
    return jsonb_build_object('status', 'ignored', 'reason', 'unknown_domain');
  end if;
  if payment.status <> 'pending' or domain.status <> 'pending_payment' then
    update public.payments set status = 'paid' where id = payment.id;
    insert into public.audit_log (ator, acao, alvo, diff)
      values (payment.user_id, 'payment.paid_after_expiry', payment.id::text,
        jsonb_build_object('provider', p_provider, 'provider_ref', p_provider_ref,
          'previous_status', payment.status, 'amount_cents', payment.amount_cents,
          'domain_id', domain.id));
    return jsonb_build_object('status', 'manual_review', 'reason', payment.status);
  end if;

  update public.payments set status = 'paid' where id = payment.id;
  update public.domains
    set status = 'pending_setup', payment_id = payment.id
    where id = domain.id;
  insert into public.notifications (user_id, tipo, titulo, corpo)
    values (domain.user_id, 'dominio',
      'Pagamento do domínio confirmado',
      'Recebemos o pagamento de ' || domain.desired_host ||
      '. Nossa equipe configura e ativa seu domínio em até 48h.');
  insert into public.audit_log (ator, acao, alvo, diff)
    values (domain.user_id, 'domain.payment_confirmed', domain.id::text,
      jsonb_build_object('provider', p_provider, 'amount_cents', payment.amount_cents,
        'desired_host', domain.desired_host));
  return jsonb_build_object('status', 'confirmed', 'domain_id', domain.id);
end;
$$;
grant execute on function public.confirm_domain_payment(text, text) to service_role;
revoke all on function public.confirm_domain_payment(text, text) from public, anon, authenticated;

-- Gestão manual do domínio pelo admin: ativar (define host + 1 ano),
-- rejeitar, remover e renovar (+1 ano). Cada ação audita e notifica.
create function public.admin_manage_domain(
  p_domain uuid, p_action text, p_host text default null, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  domain public.domains%rowtype;
  clean_host text;
begin
  if not public.is_admin() then
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
      set host = clean_host, status = 'active',
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
grant execute on function public.admin_manage_domain(uuid, text, text, text) to authenticated;

commit;
