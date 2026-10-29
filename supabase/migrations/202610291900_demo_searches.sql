begin;

-- Cache das buscas reais da demonstração pública: a mesma query não
-- chama o provedor duas vezes (custo por busca é real). Somente o
-- service role lê/escreve — a rota /api/demo/search sanitiza antes
-- de devolver pro visitante.
create table public.demo_searches (
  id uuid primary key default gen_random_uuid(),
  query text not null check (length(query) between 1 and 300),
  query_norm text generated always as (lower(btrim(query))) stored,
  results jsonb not null,
  provedor text not null,
  created_at timestamptz not null default now(),
  unique (query_norm)
);
alter table public.demo_searches enable row level security;
revoke all on public.demo_searches from public, anon, authenticated;
grant all on public.demo_searches to service_role;

commit;
