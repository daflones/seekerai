begin;

create extension if not exists pgcrypto with schema extensions;

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '' check (char_length(nome) <= 150),
  telefone text check (char_length(telefone) <= 30),
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  onboarding_concluido boolean not null default false,
  consentimento_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  preco_centavos integer not null check (preco_centavos >= 0),
  intervalo text not null default 'month' check (intervalo = 'month'),
  creditos_mensais integer not null default 0 check (creditos_mensais >= 0),
  limites jsonb not null default '{}'::jsonb,
  ativo boolean not null default false,
  ordem integer not null default 0,
  destaque boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  saldo integer not null default 0 check (saldo >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null check (delta <> 0),
  saldo_apos integer not null check (saldo_apos >= 0),
  motivo text not null check (length(motivo) between 1 and 300),
  ref text not null check (length(ref) between 1 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, ref)
);
create index credit_ledger_user_created_idx on public.credit_ledger(user_id, created_at desc);

create table public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  provedor text not null,
  nome text not null,
  valor_criptografado text not null,
  ultimos4 text not null check (length(ultimos4) <= 4),
  atualizado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provedor, nome)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  ator uuid references public.profiles(id) on delete set null,
  acao text not null,
  alvo text not null,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log(created_at desc);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.profiles, public.plans, public.credit_wallets,
  public.credit_ledger, public.integration_secrets, public.audit_log from anon, authenticated;

grant select on public.profiles, public.credit_wallets, public.credit_ledger to authenticated;
grant update (nome, telefone, avatar_url) on public.profiles to authenticated;
grant select on public.plans to anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.profiles, public.plans, public.credit_wallets,
  public.credit_ledger, public.integration_secrets, public.audit_log to service_role;

create policy profiles_read on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));
create policy profiles_update_self on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy active_plans_read on public.plans for select to anon, authenticated
  using (ativo);
create policy wallets_read on public.credit_wallets for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy ledger_read on public.credit_ledger for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy audit_read_admin on public.audit_log for select to authenticated
  using ((select public.is_admin()));
create policy secrets_server_only on public.integration_secrets for all to service_role
  using (true) with check (true);

create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger plans_updated before update on public.plans
  for each row execute function public.set_updated_at();
create trigger wallets_updated before update on public.credit_wallets
  for each row execute function public.set_updated_at();
create trigger secrets_updated before update on public.integration_secrets
  for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Roles and consent are never copied from client-controlled user metadata.
  insert into public.profiles (id, nome)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 150));
  insert into public.credit_wallets (user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
