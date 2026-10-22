-- Valor fechado do lead (quando status = 'ganho')
alter table public.leads
  add column if not exists valor_fechado numeric(12,2)
  check (valor_fechado is null or valor_fechado >= 0);
