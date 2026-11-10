-- Vínculo de cliente + marcação de "ganho" nos projetos do estúdio.
-- lead_id liga o app/site gerado a um lead do CRM; ganho_em marca que
-- o trabalho foi vendido — itens ganhos escapam da purga de 7 dias.

alter table public.studio_projects
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists ganho_em timestamptz;

create index if not exists studio_projects_unwon_idx
  on public.studio_projects(created_at)
  where ganho_em is null;

-- Purga dura em 7 dias dos assets de leads que não viraram "ganho":
-- sites + saídas de IA (site/imagem) do lead e projetos do estúdio sem
-- ganho — incluindo o site publicado ligado ao projeto. Sites com
-- domínio próprio ativo são preservados (dado pago do usuário).
-- Retorna os slugs de site removidos para a rota de cron apagar as
-- pastas correspondentes no bucket site-assets.
create or replace function public.purge_unwon_assets()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  site_slugs text[];
  studio_slugs text[];
  n_sites int; n_outputs int; n_projects int;
begin
  -- 1) Sites de lead não-ganho com +7 dias.
  with doomed as (
    delete from public.sites s
    using public.leads l
    where s.lead_id = l.id
      and s.sem_expiracao = false
      and s.created_at < now() - interval '7 days'
      and l.status <> 'ganho'
      and not exists (
        select 1 from public.domains d
        where d.site_slug = s.slug and d.status = 'active')
    returning s.slug
  )
  select coalesce(array_agg(slug), '{}'), count(*)
    into site_slugs, n_sites
  from doomed;

  -- 2) Saídas de IA (site/imagem) de leads não-ganhos com +7 dias.
  delete from public.lead_outputs o
  using public.leads l
  where o.lead_id = l.id
    and l.status <> 'ganho'
    and o.tipo in ('generate_site', 'generate_image')
    and o.created_at < now() - interval '7 days';
  get diagnostics n_outputs = row_count;

  -- 3) Projetos do estúdio sem "ganho" com +7 dias — apaga também o
  --    site publicado vinculado (mesma pasta no bucket).
  with doomed as (
    select p.id, p.site_slug from public.studio_projects p
    left join public.leads l on l.id = p.lead_id
    where p.status <> 'running'
      and p.ganho_em is null
      and coalesce(l.status, '') <> 'ganho'
      and p.created_at < now() - interval '7 days'
  ), del_sites as (
    delete from public.sites s
    where s.slug in (select site_slug from doomed where site_slug is not null)
      and not exists (
        select 1 from public.domains d
        where d.site_slug = s.slug and d.status = 'active')
    returning s.slug
  ), del_projects as (
    delete from public.studio_projects
    where id in (select id from doomed)
    returning id
  )
  select (select coalesce(array_agg(slug), '{}') from del_sites),
         (select count(*) from del_projects)
    into studio_slugs, n_projects;

  return jsonb_build_object(
    'site_slugs', site_slugs || studio_slugs,
    'sites_removed', n_sites,
    'outputs_removed', n_outputs,
    'projects_removed', n_projects);
end;
$$;

revoke all on function public.purge_unwon_assets() from public, anon, authenticated;
grant execute on function public.purge_unwon_assets() to service_role;
