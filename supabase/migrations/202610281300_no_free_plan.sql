begin;

-- Sem plano grátis: o card "gratis" sai da view pública
-- (landing + /app/planos). A linha permanece no banco por causa
-- das FKs (subscriptions, plan_credit_grants) — só sai do ar.
update public.plans set landing_visible = false where slug = 'gratis';

commit;
