begin;

-- Plano grátis: 10 créditos de boas-vindas (antes 50).
update public.credit_settings set welcome_credits = 10 where singleton;

commit;
