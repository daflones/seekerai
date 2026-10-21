begin;

create table public.services_catalog (
  slug text primary key,
  nome text not null,
  categoria text not null,
  ativo boolean not null default true,
  enabled_actions text[] not null default array['search', 'deep_strategy', 'sales_reply'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ('search' = any(enabled_actions)),
  check (enabled_actions <@ array['search', 'deep_strategy', 'sales_reply', 'generate_site', 'generate_image'])
);
insert into public.services_catalog (slug, nome, categoria, enabled_actions) values
  ('sites', 'Criação de sites', 'Web e tecnologia', array['search','deep_strategy','sales_reply','generate_site']),
  ('landing_pages', 'Landing pages', 'Web e tecnologia', array['search','deep_strategy','sales_reply','generate_site']),
  ('ecommerce', 'Lojas virtuais e e-commerce', 'Web e tecnologia', array['search','deep_strategy','sales_reply','generate_site','generate_image']),
  ('automacao', 'Automação de processos', 'Web e tecnologia', array['search','deep_strategy','sales_reply']),
  ('chatbots', 'Chatbots e agentes de IA', 'Web e tecnologia', array['search','deep_strategy','sales_reply']),
  ('trafego', 'Tráfego pago', 'Marketing e vendas', array['search','deep_strategy','sales_reply','generate_image']),
  ('social', 'Gestão de redes sociais', 'Marketing e vendas', array['search','deep_strategy','sales_reply','generate_image']),
  ('seo', 'SEO e busca orgânica', 'Marketing e vendas', array['search','deep_strategy','sales_reply']),
  ('google_business', 'Perfil da Empresa no Google', 'Marketing e vendas', array['search','deep_strategy','sales_reply']),
  ('copywriting', 'Copywriting e textos de venda', 'Marketing e vendas', array['search','deep_strategy','sales_reply']),
  ('email_marketing', 'E-mail marketing e CRM', 'Marketing e vendas', array['search','deep_strategy','sales_reply']),
  ('gestao_whatsapp', 'Atendimento e vendas no WhatsApp', 'Marketing e vendas', array['search','deep_strategy','sales_reply']),
  ('consultoria_marketing', 'Consultoria de marketing', 'Marketing e vendas', array['search','deep_strategy','sales_reply']),
  ('design', 'Design gráfico', 'Design e audiovisual', array['search','deep_strategy','sales_reply','generate_image']),
  ('branding', 'Branding e identidade visual', 'Design e audiovisual', array['search','deep_strategy','sales_reply','generate_image']),
  ('edicao_video', 'Edição de vídeo', 'Design e audiovisual', array['search','deep_strategy','sales_reply']),
  ('gravacao_video', 'Gravação e produção de vídeo', 'Design e audiovisual', array['search','deep_strategy','sales_reply']),
  ('fotografia', 'Fotografia comercial', 'Design e audiovisual', array['search','deep_strategy','sales_reply']),
  ('motion_design', 'Motion design e animação', 'Design e audiovisual', array['search','deep_strategy','sales_reply','generate_image']),
  ('producao_conteudo', 'Produção de conteúdo e UGC', 'Design e audiovisual', array['search','deep_strategy','sales_reply','generate_image']);

create table public.credit_settings (
  singleton boolean primary key default true check (singleton),
  welcome_credits integer not null default 50 check (welcome_credits between 0 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.credit_settings (singleton, welcome_credits) values (true, 50);

create table public.credit_action_rules (
  action text primary key check (action in ('search', 'generate_image', 'generate_site', 'deep_strategy', 'sales_reply')),
  cost integer check (cost between 1 and 1000000),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not enabled or cost is not null)
);
insert into public.credit_action_rules (action, cost, enabled) values
  ('search', 4, true),
  ('generate_image', 2, true),
  ('generate_site', 5, true),
  ('deep_strategy', null, false),
  ('sales_reply', null, false);

create table public.credit_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null references public.credit_action_rules(action),
  business_ref text check (length(business_ref) between 1 and 300),
  service text not null references public.services_catalog(slug),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  request_ref text not null check (length(request_ref) between 1 and 150),
  cost integer not null check (cost > 0),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_ref),
  check ((action = 'search' and business_ref is null) or (action <> 'search' and business_ref is not null))
);
create index credit_operations_user_created_idx on public.credit_operations(user_id, created_at desc);
create index credit_operations_pending_idx on public.credit_operations(created_at) where status = 'reserved';

create table public.plan_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  cycle_ref text not null check (length(cycle_ref) between 1 and 150),
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now(),
  unique (user_id, cycle_ref)
);

alter table public.credit_settings enable row level security;
alter table public.services_catalog enable row level security;
alter table public.credit_action_rules enable row level security;
alter table public.credit_operations enable row level security;
alter table public.plan_credit_grants enable row level security;
revoke all on public.credit_settings, public.credit_action_rules, public.credit_operations,
  public.plan_credit_grants from anon, authenticated;
revoke all on public.services_catalog from anon, authenticated;
grant select on public.services_catalog to anon, authenticated;
grant all on public.services_catalog to service_role;
grant select on public.credit_settings, public.credit_action_rules,
  public.credit_operations, public.plan_credit_grants to authenticated;
grant all on public.credit_settings, public.credit_action_rules,
  public.credit_operations, public.plan_credit_grants to service_role;

create policy credit_settings_read on public.credit_settings for select to authenticated using (true);
create policy active_services_read on public.services_catalog for select to anon, authenticated using (ativo);
create policy action_rules_read on public.credit_action_rules for select to authenticated using (true);
create policy credit_operations_read on public.credit_operations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy plan_grants_read on public.plan_credit_grants for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create trigger credit_settings_updated before update on public.credit_settings
  for each row execute function public.set_updated_at();
create trigger services_catalog_updated before update on public.services_catalog
  for each row execute function public.set_updated_at();
create trigger action_rules_updated before update on public.credit_action_rules
  for each row execute function public.set_updated_at();
create trigger credit_operations_updated before update on public.credit_operations
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  bonus integer;
begin
  insert into public.profiles (id, nome)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 150));
  insert into public.credit_wallets (user_id) values (new.id);
  select welcome_credits into strict bonus from public.credit_settings where singleton;
  if bonus > 0 then
    perform public.apply_credit_delta(new.id, bonus, 'welcome_bonus', 'welcome:v1');
  end if;
  return new;
end;
$$;

commit;
