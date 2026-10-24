-- Cache de perfis/mídia do Instagram por handle.
-- Cada parte tem seu timestamp: a busca enriquece `perfil`,
-- a geração de site preenche `media` — TTL 7 dias por parte.
create table if not exists ig_cache (
  handle     text primary key,
  perfil     jsonb,
  perfil_at  timestamptz,
  media      jsonb,
  media_at   timestamptz,
  updated_at timestamptz not null default now()
);

-- Só service role lê/escreve (edge functions); nenhum acesso via anon.
alter table ig_cache enable row level security;
