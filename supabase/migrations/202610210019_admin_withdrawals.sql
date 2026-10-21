begin;

-- Saques pelo painel admin (MercosulPay): chaves PIX salvas e histórico.
create table public.admin_pix_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 80),
  pix_key text not null check (char_length(pix_key) between 3 and 200),
  pix_key_type text not null
    check (pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'evp', 'emv')),
  -- Obrigatório quando a chave é phone/email/evp (exigência do banco receptor).
  recipient_document text check (
    recipient_document is null or char_length(recipient_document) between 11 and 20),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.admin_withdrawals (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  pix_key text not null check (char_length(pix_key) between 3 and 200),
  pix_key_type text not null,
  recipient_document text,
  status text not null default 'pendente'
    check (status in ('pendente', 'concluido', 'falhou')),
  provider_ref text,
  erro text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.admin_pix_keys enable row level security;
alter table public.admin_withdrawals enable row level security;

create policy admin_pix_keys_admin_read on public.admin_pix_keys
  for select to authenticated using ((select public.is_admin()));
create policy admin_withdrawals_admin_read on public.admin_withdrawals
  for select to authenticated using ((select public.is_admin()));

commit;
