-- Admin nunca perde site por plano/domínio (mesmo bypass do gate público).

create or replace function public.enforce_site_expirations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  warned int := 0;
  off_sub int := 0;
  dom_warned int := 0;
  dom_exp int := 0;
  off_dom int := 0;
begin
  -- a) Aviso de plano encerrado (1x por usuário por encerramento):
  --    sem assinatura ativa, com assinatura anterior encerrada há < 7 dias
  --    e pelo menos um site publicado.
  insert into public.notifications (user_id, tipo, titulo, corpo)
  select distinct s.owner_id, 'plano_expirado',
    'Sua assinatura encerrou — renove para manter seus sites no ar',
    'Em até 7 dias os sites sem domínio próprio saem do ar. Sites com domínio ativo continuam online até o fim da anuidade. Renove o plano em /app/planos ou ative um domínio em /app/dominios.'
  from public.sites s
  where s.publicado = true
    and s.owner_id is not null
    and s.sub_warned_at is null
    and not exists (select 1 from public.profiles pr
                    where pr.id = s.owner_id and pr.role = 'admin')
    and not exists (select 1 from public.subscriptions a
                    where a.user_id = s.owner_id and a.status = 'active')
    and exists (select 1 from public.subscriptions p
                where p.user_id = s.owner_id
                  and p.status in ('canceled', 'past_due')
                  and greatest(coalesce(p.current_period_end, p.updated_at), p.updated_at)
                      between now() - interval '7 days' and now())
    and not exists (select 1 from public.notifications n
                    where n.user_id = s.owner_id and n.tipo = 'plano_expirado'
                      and n.created_at > now() - interval '30 days');
  get diagnostics warned = row_count;
  update public.sites s set sub_warned_at = now()
    where s.publicado = true and s.owner_id is not null and s.sub_warned_at is null
      and not exists (select 1 from public.profiles pr
                      where pr.id = s.owner_id and pr.role = 'admin')
      and not exists (select 1 from public.subscriptions a
                      where a.user_id = s.owner_id and a.status = 'active')
      and exists (select 1 from public.subscriptions p
                  where p.user_id = s.owner_id
                    and p.status in ('canceled', 'past_due')
                    and greatest(coalesce(p.current_period_end, p.updated_at), p.updated_at)
                        < now());

  -- b) Grace esgotado: desativa sites sem domínio vivo de ex-assinantes.
  update public.sites s
  set publicado = false, desativado_em = now(),
      desativado_motivo = 'subscription', updated_at = now()
  where s.publicado = true
    and s.owner_id is not null
    and not exists (select 1 from public.profiles pr
                    where pr.id = s.owner_id and pr.role = 'admin')
    and not exists (select 1 from public.subscriptions a
                    where a.user_id = s.owner_id and a.status = 'active')
    and exists (select 1 from public.subscriptions p
                where p.user_id = s.owner_id
                  and p.status in ('canceled', 'past_due')
                  and greatest(coalesce(p.current_period_end, p.updated_at), p.updated_at)
                      < now() - interval '7 days')
    and not exists (select 1 from public.domains d
                    where d.site_slug = s.slug and d.status = 'active'
                      and d.expires_at > now() - interval '7 days');
  get diagnostics off_sub = row_count;

  -- c) Domínio expirado (anuidade venceu, ainda na tolerância): aviso 1x.
  insert into public.notifications (user_id, tipo, titulo, corpo)
  select d.user_id, 'dominio_expirado',
    'Seu domínio expirou — renove em até 7 dias',
    d.host || ' venceu e o site ' || d.site_slug || ' sai do ar em até 7 dias se a anuidade não for renovada. Renove em /app/dominios.'
  from public.domains d
  where d.status = 'active'
    and d.expires_at is not null
    and d.expires_at < now()
    and d.expires_at > now() - interval '7 days'
    and d.expiry_warned_at is null;
  get diagnostics dom_warned = row_count;
  update public.domains set expiry_warned_at = now()
    where status = 'active' and expires_at is not null
      and expires_at < now() and expires_at > now() - interval '7 days'
      and expiry_warned_at is null;

  -- d) Tolerância do domínio esgotada: marca expirado e derruba o site
  --    (a menos que o dono tenha assinatura ativa — o plano também segura).
  update public.domains
  set status = 'expired', updated_at = now()
    where status = 'active' and expires_at is not null
      and expires_at < now() - interval '7 days';
  get diagnostics dom_exp = row_count;

  update public.sites s
  set publicado = false, desativado_em = now(),
      desativado_motivo = 'domain', updated_at = now()
  where s.publicado = true
    and exists (select 1 from public.domains d
                where d.site_slug = s.slug and d.status = 'expired')
    and not exists (select 1 from public.domains d
                    where d.site_slug = s.slug and d.status = 'active'
                      and d.expires_at > now() - interval '7 days')
    and not exists (select 1 from public.subscriptions a
                    where a.user_id = s.owner_id and a.status = 'active')
    and not exists (select 1 from public.profiles pr
                    where pr.id = s.owner_id and pr.role = 'admin');
  get diagnostics off_dom = row_count;

  return jsonb_build_object(
    'warned', warned, 'sites_off_sub', off_sub,
    'domains_warned', dom_warned, 'domains_expired', dom_exp,
    'sites_off_domain', off_dom);
end;
$$;
revoke all on function public.enforce_site_expirations() from public, anon, authenticated;
grant execute on function public.enforce_site_expirations() to service_role;
