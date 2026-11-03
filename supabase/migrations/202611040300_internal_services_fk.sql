begin;

-- Serviços internos ("_editor", "_admin") não existem no catálogo de
-- nichos — o reserve já valida catálogo só pra serviços públicos, mas o
-- insert em credit_operations estourava na FK. A coluna vira auditoria
-- pura; a checagem de compatibilidade segue na reserve_credit_action.
alter table public.credit_operations
  drop constraint if exists credit_operations_service_fkey;

commit;
