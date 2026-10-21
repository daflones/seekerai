begin;

-- Jobs de busca: a chamada à API roda no servidor web em background,
-- então o usuário pode trocar de aba/página sem perder o resultado.
create table public.search_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'done', 'error')),
  payload jsonb not null,
  result jsonb,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index search_jobs_user_recent
  on public.search_jobs (user_id, created_at desc);

alter table public.search_jobs enable row level security;

-- O dono lê o próprio job; escrita só via service role (API do site).
create policy "search_jobs_owner_read"
  on public.search_jobs for select
  using (auth.uid() = user_id);

commit;
