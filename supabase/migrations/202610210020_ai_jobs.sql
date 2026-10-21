begin;

-- Jobs de geração IA pesada (site): a edge pode levar minutos quando o
-- provedor principal falha e o fallback lento assume. Roda detached no
-- servidor web; o cliente faz polling e pode sair da página sem perder.
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in ('generate_site')),
  status text not null default 'running'
    check (status in ('running', 'done', 'error')),
  result jsonb,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_jobs_lead_recent on public.ai_jobs (lead_id, created_at desc);

alter table public.ai_jobs enable row level security;

create policy "ai_jobs_owner_read"
  on public.ai_jobs for select
  using (auth.uid() = user_id);

commit;
