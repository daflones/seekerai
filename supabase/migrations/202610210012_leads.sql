begin;

-- CRM de leads: estabelecimentos salvos a partir das buscas reais.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_slug text not null references public.services_catalog(slug),
  place_id text check (place_id is null or char_length(place_id) <= 300),
  nome text not null check (char_length(nome) between 1 and 200),
  endereco text check (char_length(endereco) <= 500),
  bairro text check (char_length(bairro) <= 150),
  cidade text check (char_length(cidade) <= 150),
  uf text check (char_length(uf) <= 50),
  telefone text check (char_length(telefone) <= 40),
  site text check (char_length(site) <= 500),
  avaliacao numeric(3,1) check (avaliacao between 0 and 5),
  total_avaliacoes integer check (total_avaliacoes >= 0),
  categoria text check (char_length(categoria) <= 150),
  maps_url text check (char_length(maps_url) <= 800),
  imagem text check (char_length(imagem) <= 800),
  lat double precision,
  lng double precision,
  status text not null default 'novo'
    check (status in ('novo', 'contatado', 'respondeu', 'proposta', 'ganho', 'perdido')),
  whatsapp text check (whatsapp is null or whatsapp in ('sim', 'nao')),
  notas text check (char_length(notas) <= 2000),
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, place_id)
);
create index leads_user_status_idx on public.leads(user_id, status, created_at desc);

-- Saídas de IA vinculadas a um lead (mensagem, estratégia, site, imagem).
create table public.lead_outputs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null
    check (tipo in ('sales_reply', 'deep_strategy', 'generate_site', 'generate_image')),
  conteudo text not null check (char_length(conteudo) between 1 and 400000),
  modelo text check (char_length(modelo) <= 120),
  created_at timestamptz not null default now()
);
create index lead_outputs_lead_idx on public.lead_outputs(lead_id, created_at desc);

alter table public.leads enable row level security;
alter table public.lead_outputs enable row level security;
revoke all on public.leads, public.lead_outputs from anon, authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, delete on public.lead_outputs to authenticated;
grant all on public.leads, public.lead_outputs to service_role;

create policy leads_owner on public.leads for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy lead_outputs_owner on public.lead_outputs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger leads_updated before update on public.leads
  for each row execute function public.set_updated_at();

commit;
