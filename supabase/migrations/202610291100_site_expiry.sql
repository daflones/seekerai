-- Trial do site do lead: fica no ar 7 dias ou até o lead fechar.
-- desativado_em marca quando/quem tirou do ar; sem_expiracao isenta do
-- trial (reativação manual do usuário).

alter table public.sites
  add column if not exists desativado_em timestamptz,
  add column if not exists desativado_motivo text
    check (desativado_motivo in ('expired', 'manual')),
  add column if not exists sem_expiracao boolean not null default false;

create index if not exists sites_lead_expiry_idx
  on public.sites(lead_id, publicado, created_at)
  where lead_id is not null and publicado = true and sem_expiracao = false;

-- Desativa sites de lead com +7 dias que não chegaram em 'ganho'.
-- Idempotente e segura pra rodar em cron — também é chamada na leitura
-- lazy do site (loadSite), então funciona mesmo sem agendador.
create or replace function public.expire_lead_sites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.sites s
  set publicado = false, desativado_em = now(), desativado_motivo = 'expired',
      updated_at = now()
  from public.leads l
  where s.lead_id = l.id
    and s.publicado = true
    and s.sem_expiracao = false
    and s.created_at < now() - interval '7 days'
    and l.status <> 'ganho';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_lead_sites() from public, anon, authenticated;
grant execute on function public.expire_lead_sites() to service_role;
