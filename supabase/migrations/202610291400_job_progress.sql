-- Progresso em tempo real dos jobs: as edges e orquestradores atualizam
-- progresso/etapa durante o trabalho; o painel admin exibe a barra viva.

begin;

alter table public.search_jobs
  add column if not exists progresso integer not null default 0
    check (progresso between 0 and 100),
  add column if not exists etapa text;

alter table public.ai_jobs
  add column if not exists progresso integer not null default 0
    check (progresso between 0 and 100),
  add column if not exists etapa text;

alter table public.studio_projects
  add column if not exists progresso integer not null default 0
    check (progresso between 0 and 100),
  add column if not exists etapa text;

commit;
