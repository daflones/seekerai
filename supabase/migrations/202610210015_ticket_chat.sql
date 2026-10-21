begin;

-- Chamados viram conversas: mensagens com papel do remetente + novos status.
-- Regras: 'resolvido'/'cancelado'/'expirado' bloqueiam novas mensagens do cliente.

alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets
  add constraint support_tickets_status_check
    check (status in ('aberto', 'em_andamento', 'pendente', 'resolvido', 'cancelado'));

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'admin')),
  mensagem text not null check (char_length(mensagem) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index ticket_messages_ticket_idx on public.ticket_messages(ticket_id, created_at);
alter table public.ticket_messages replica identity full;

alter table public.ticket_messages enable row level security;
revoke all on public.ticket_messages from anon;
grant select, insert on public.ticket_messages to authenticated;
grant all on public.ticket_messages to service_role;

-- Leitura: dono do chamado ou admin.
create policy ticket_messages_read on public.ticket_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (t.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

-- Cliente escreve como 'user' somente em chamado próprio e ainda aberto.
create policy ticket_messages_user_insert on public.ticket_messages
  for insert to authenticated
  with check (
    sender_role = 'user'
    and sender_id = (select auth.uid())
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and t.user_id = (select auth.uid())
        and t.status in ('aberto', 'em_andamento', 'pendente')
    )
  );

-- Admin responde como 'admin' em qualquer chamado (mesmo resolvido, para registrar nota).
create policy ticket_messages_admin_insert on public.ticket_messages
  for insert to authenticated
  with check (sender_role = 'admin' and (select public.is_admin()));

-- Admin atualiza status do chamado.
create policy support_tickets_admin_update on public.support_tickets
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Realtime: mensagens chegam ao chat sem recarregar.
do $$
begin
  alter publication supabase_realtime add table public.ticket_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

commit;
