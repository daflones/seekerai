-- O bucket público `site-assets` é criado por scripts/apply-site.mjs
-- (storage.buckets não existe em ambientes de teste/pglite).

-- Sites premium por slug: /site/<slug> renderiza a experiência React a
-- partir do config (multi-tenant — um site por linha, sem código novo).
create table public.sites (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,80}$'),
  tipo text not null default 'barbearia',
  nome text not null check (char_length(nome) between 1 and 150),
  lead_id uuid references public.leads(id) on delete set null,
  config jsonb not null default '{}'::jsonb,
  publicado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sites enable row level security;

create policy sites_public_read on public.sites
  for select to anon, authenticated
  using (publicado = true);

grant select on public.sites to anon, authenticated;
grant all on public.sites to service_role;

create trigger sites_updated_at before update on public.sites
  for each row execute function public.set_updated_at();
