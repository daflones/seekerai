begin;

-- Estúdio de geração livre: o usuário descreve o app/site que quer e a
-- IA entrega um HTML single-file completo. Ação "generate_app" cobrada
-- por créditos como as demais.

alter table public.credit_action_rules drop constraint if exists credit_action_rules_action_check;
alter table public.credit_action_rules add constraint credit_action_rules_action_check
  check (action in ('search', 'generate_image', 'generate_site', 'deep_strategy',
                    'sales_reply', 'whatsapp_check', 'lead_assist', 'image_prompt',
                    'generate_app'));

alter table public.services_catalog drop constraint if exists services_catalog_enabled_actions_scope;
alter table public.services_catalog add constraint services_catalog_enabled_actions_scope
  check (enabled_actions <@ array['search', 'deep_strategy', 'sales_reply',
                                  'generate_site', 'generate_image', 'whatsapp_check',
                                  'lead_assist', 'image_prompt', 'generate_app']);

insert into public.credit_action_rules (action, cost, enabled) values
  ('generate_app', 10, true)
on conflict (action) do update set cost = 10, enabled = true;

update public.services_catalog
  set enabled_actions = array_append(enabled_actions, 'generate_app')
  where slug = 'sites' and not ('generate_app' = any(enabled_actions));

-- Projetos do estúdio: status=running é o job em andamento (geração é
-- detached — o cliente faz polling). site_slug = publicado em /site/<slug>.
create table public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 150),
  prompt text not null check (char_length(prompt) between 10 and 20000),
  target text not null check (target in ('web', 'mobile')),
  html text,
  refs jsonb not null default '[]'::jsonb,
  status text not null default 'running'
    check (status in ('running', 'done', 'error')),
  erro text,
  modelo text,
  site_slug text unique check (site_slug is null or site_slug ~ '^[a-z0-9-]{2,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studio_projects_user_idx on public.studio_projects(user_id, created_at desc);

alter table public.studio_projects enable row level security;

create policy studio_owner on public.studio_projects for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.studio_projects to authenticated;
grant all on public.studio_projects to service_role;

create trigger studio_projects_updated before update on public.studio_projects
  for each row execute function public.set_updated_at();

commit;
