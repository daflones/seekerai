-- Feed de progresso vivo: cada etapa reportada pela edge vira um evento
-- append-only em `eventos` (jsonb [{p, etapa, at}]) — o frontend mostra
-- como chat "o que a IA está fazendo" durante a geração.
alter table ai_jobs add column if not exists eventos jsonb not null default '[]'::jsonb;
alter table studio_projects add column if not exists eventos jsonb not null default '[]'::jsonb;

create or replace function report_job_event(
  p_table text,
  p_id uuid,
  p_pct integer,
  p_etapa text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pct is null or p_etapa is null or length(p_etapa) > 200 or length(p_etapa) = 0 then
    return;
  end if;
  if p_table = 'ai_jobs' then
    update ai_jobs set
      progresso = greatest(0, least(100, p_pct)),
      etapa = p_etapa,
      eventos = case
        when jsonb_array_length(coalesce(eventos, '[]'::jsonb)) < 80
          then coalesce(eventos, '[]'::jsonb) || jsonb_build_object(
            'p', p_pct, 'etapa', p_etapa,
            'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        else eventos
      end,
      updated_at = now()
    where id = p_id and status = 'running';
  elsif p_table = 'studio_projects' then
    update studio_projects set
      progresso = greatest(0, least(100, p_pct)),
      etapa = p_etapa,
      eventos = case
        when jsonb_array_length(coalesce(eventos, '[]'::jsonb)) < 80
          then coalesce(eventos, '[]'::jsonb) || jsonb_build_object(
            'p', p_pct, 'etapa', p_etapa,
            'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        else eventos
      end,
      updated_at = now()
    where id = p_id and status = 'running';
  end if;
end;
$$;

revoke all on function report_job_event(text, uuid, integer, text) from public, anon, authenticated;
grant execute on function report_job_event(text, uuid, integer, text) to service_role;
