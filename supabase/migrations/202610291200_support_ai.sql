-- Agente de suporte por IA.
-- sender_role 'ia' (sender_id nulo — não é um usuário auth), status
-- 'expirado' (inatividade) e coluna `atendente` marcando quem conduz.

begin;

alter table public.ticket_messages
  alter column sender_id drop not null;
alter table public.ticket_messages
  drop constraint if exists ticket_messages_sender_role_check;
alter table public.ticket_messages
  add constraint ticket_messages_sender_role_check
    check (sender_role in ('user', 'admin', 'ia'));

alter table public.support_tickets
  drop constraint if exists support_tickets_status_check;
alter table public.support_tickets
  add constraint support_tickets_status_check
    check (status in ('aberto', 'em_andamento', 'pendente', 'resolvido', 'cancelado', 'expirado'));

alter table public.support_tickets
  add column if not exists atendente text not null default 'ia'
    check (atendente in ('ia', 'admin'));

-- Chamados antigos que já tinham resposta humana ficam com o admin.
update public.support_tickets t set atendente = 'admin'
where exists (
  select 1 from public.ticket_messages m
  where m.ticket_id = t.id and m.sender_role = 'admin'
);

-- Encerra chamados atendidos pela IA sem resposta do cliente há p_hours.
-- Só expira quando a última mensagem NÃO é do cliente (dúvida aberta
-- do cliente nunca é varrida).
create or replace function public.close_stale_tickets(p_hours integer default 72)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with stale as (
    select t.id
    from public.support_tickets t
    where t.status in ('aberto', 'em_andamento', 'pendente')
      and (
        select m.sender_role from public.ticket_messages m
        where m.ticket_id = t.id
        order by m.created_at desc limit 1
      ) is distinct from 'user'
      and (
        select m.created_at from public.ticket_messages m
        where m.ticket_id = t.id
        order by m.created_at desc limit 1
      ) < now() - make_interval(hours => p_hours)
  ), closed as (
    update public.support_tickets s
    set status = 'expirado', updated_at = now()
    where s.id in (select id from stale)
    returning s.id
  )
  insert into public.ticket_messages (ticket_id, sender_id, sender_role, mensagem)
  select id, null, 'ia',
    'Encerrando este chamado por inatividade. Se ainda precisar de ajuda, abra um novo chamado — estamos por aqui.'
  from closed;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.close_stale_tickets(integer) from public, anon, authenticated;
grant execute on function public.close_stale_tickets(integer) to service_role;

commit;
