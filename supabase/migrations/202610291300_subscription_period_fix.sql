-- Corrige current_period_end das assinaturas não-Stripe:
-- o webhook PIX somava +4 dias de "folga" e o grant admin usava +30d fixo.
-- Regra única: fim do período = created_at + billing_months meses.
-- Assinaturas Stripe guardam o período real retornado pela API — intactas.

begin;

update public.subscriptions
set current_period_end = created_at + make_interval(months => coalesce(billing_months, 1)),
    updated_at = now()
where provider <> 'stripe'
  and current_period_end is not null;

commit;
