-- Estúdio: @instagram de referência opcional por projeto.
alter table public.studio_projects
  add column if not exists ig text;
