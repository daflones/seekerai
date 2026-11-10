-- Agendamento nativo do Supabase (pg_cron + pg_net) das rotas de cron
-- do app — dispensa scheduler externo (EasyPanel etc.).
--
-- A autenticação das rotas aceita INTERNAL_CRON_SECRET (env do app) OU a
-- chave gerada aqui em internal_kv — tabela service-role only, então o
-- valor não fica legível pra usuários autenticados nem vai pro git.

create table if not exists public.internal_kv (
  key text primary key,
  value text not null
);
alter table public.internal_kv enable row level security;
revoke all on public.internal_kv from public, anon, authenticated;
grant all on public.internal_kv to service_role;

insert into public.internal_kv (key, value)
values ('cron_auth', gen_random_uuid()::text)
on conflict (key) do nothing;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- A cada 15min: expira/purga sites, outputs e projetos do estúdio sem
-- "ganho" (+7 dias) e limpa as pastas do bucket site-assets.
select cron.unschedule(jobid) from cron.job where jobname = 'seekerai-expire-sites';
select cron.schedule(
  'seekerai-expire-sites', '*/15 * * * *',
  $job$
    select net.http_get(
      url := 'https://seekerai.digital/api/cron/expire-sites',
      headers := jsonb_build_object(
        'x-internal-key',
        (select value from public.internal_kv where key = 'cron_auth')
      ),
      timeout_milliseconds := 120000
    )
  $job$
);

-- A cada 15min: varre chamados de suporte sem resposta do agente.
select cron.unschedule(jobid) from cron.job where jobname = 'seekerai-support-sweep';
select cron.schedule(
  'seekerai-support-sweep', '*/15 * * * *',
  $job$
    select net.http_get(
      url := 'https://seekerai.digital/api/cron/support-sweep',
      headers := jsonb_build_object(
        'x-internal-key',
        (select value from public.internal_kv where key = 'cron_auth')
      ),
      timeout_milliseconds := 60000
    )
  $job$
);
