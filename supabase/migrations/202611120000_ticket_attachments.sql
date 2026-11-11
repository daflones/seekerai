begin;

-- Anexos (imagens/PDF) e resposta com citação no chat de chamados.
alter table public.ticket_messages
  add column if not exists anexos jsonb not null default '[]'::jsonb,
  add column if not exists reply_to uuid null
    references public.ticket_messages(id) on delete set null;

-- Bucket privado: upload/leitura só via API (service role + URL assinada
-- curta). Sem RLS de storage — todo acesso passa pelas rotas /api/tickets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-files', 'support-files', false, 8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;

commit;
