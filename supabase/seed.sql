-- Inactive until commercial rules and payment integrations are validated.
insert into public.plans (slug, nome, preco_centavos, creditos_mensais, limites, ordem, destaque, ativo)
values
  ('gratis', 'Grátis', 0, 0, '{"leads_por_busca":3,"portfolio_limite":3}', 0, false, false),
  ('essencial', 'Essencial', 2490, 150, '{"leads_por_busca":10,"portfolio_limite":3,"sem_marca":true}', 1, false, false),
  ('pro', 'Pro', 4990, 300, '{"leads_por_busca":30,"agente_vendas":true,"copiloto_chamada":true}', 2, true, false),
  ('king', 'King', 6490, 700, '{"leads_por_busca":50,"agente_vendas":true,"copiloto_chamada":true,"portfolio_ilimitado":true}', 3, false, false)
on conflict (slug) do nothing;
