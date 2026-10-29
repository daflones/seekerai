-- Cliente Stripe reutilizável por usuário — o Radar acompanha o histórico
-- de pagamento do mesmo Customer em vez de ver um cliente novo por sessão.
alter table public.profiles
  add column if not exists stripe_customer_id text;
