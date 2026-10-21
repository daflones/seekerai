-- SeekerAi — experiência do cliente: boas-vindas, suporte e portfólio.

-- Respostas do quiz de boas-vindas (visível uma vez após o cadastro).
alter table public.profiles
  add column onboarding_answers jsonb not null default '{}'::jsonb,
  add column onboarding_visto_em timestamptz;

create or replace function public.save_onboarding_answers(p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'Invalid answers' using errcode = '22023';
  end if;
  update public.profiles
    set onboarding_answers = p_answers,
        onboarding_visto_em = coalesce(onboarding_visto_em, now())
    where id = auth.uid();
end;
$$;

revoke all on function public.save_onboarding_answers(jsonb) from public, anon;
grant execute on function public.save_onboarding_answers(jsonb) to authenticated;

-- Chamados de suporte.
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assunto text not null check (char_length(assunto) between 5 and 140),
  categoria text not null default 'tecnico'
    check (categoria in ('tecnico', 'cobranca', 'creditos', 'sugestao', 'outro')),
  prioridade text not null default 'normal'
    check (prioridade in ('baixa', 'normal', 'alta')),
  mensagem text not null check (char_length(mensagem) between 10 and 4000),
  status text not null default 'aberto'
    check (status in ('aberto', 'em_andamento', 'resolvido')),
  resposta text check (char_length(resposta) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets(user_id, created_at desc);
create trigger support_tickets_updated before update on public.support_tickets
  for each row execute function public.set_updated_at();

alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon;
grant select, insert on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;

create policy support_tickets_owner_read on public.support_tickets
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy support_tickets_owner_insert on public.support_tickets
  for insert to authenticated
  with check (user_id = (select auth.uid()));
-- Resposta/andamento só via service_role (painel admin usa API com service client).

-- Portfólio público do usuário.
create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  nome text not null check (char_length(nome) between 1 and 120),
  profissao text check (char_length(profissao) <= 140),
  audiencia text check (char_length(audiencia) <= 140),
  diferencial text check (char_length(diferencial) <= 300),
  whatsapp text check (char_length(whatsapp) <= 30),
  instagram text check (char_length(instagram) <= 80),
  foto_url text check (char_length(foto_url) <= 400000),
  trabalhos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(trabalhos) = 'array' and jsonb_array_length(trabalhos) <= 3),
  prova jsonb not null default '{}'::jsonb check (jsonb_typeof(prova) = 'object'),
  tema text not null default 'padrao' check (tema in ('padrao', 'tecnologico', 'bento')),
  publicado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
create index portfolios_slug_idx on public.portfolios(slug) where publicado;
create trigger portfolios_updated before update on public.portfolios
  for each row execute function public.set_updated_at();

alter table public.portfolios enable row level security;
grant select on public.portfolios to anon;
grant select, insert, update, delete on public.portfolios to authenticated;
grant all on public.portfolios to service_role;

create policy portfolios_read on public.portfolios
  for select to anon, authenticated
  using (publicado or user_id = (select auth.uid()) or (select public.is_admin()));
create policy portfolios_owner_write on public.portfolios
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Métricas administrativas: admin enxerga assinaturas, pagamentos e leads.
create policy subscriptions_admin_read on public.subscriptions
  for select to authenticated using ((select public.is_admin()));
create policy payments_admin_read on public.payments
  for select to authenticated using ((select public.is_admin()));
create policy leads_admin_read on public.leads
  for select to authenticated using ((select public.is_admin()));
