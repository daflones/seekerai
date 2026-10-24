-- Marca que a mensagem de boas-vindas (WhatsApp) já foi enviada — dedup
-- entre o cadastro e a conclusão do onboarding.
alter table public.profiles
  add column if not exists boas_vindas_em timestamptz;
