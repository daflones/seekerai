begin;

-- Plano grátis sem créditos: cadastro não ganha bônus e a busca
-- exige assinatura ativa (gate também no app/api/search-jobs).
update public.credit_settings set welcome_credits = 0 where singleton;

commit;
