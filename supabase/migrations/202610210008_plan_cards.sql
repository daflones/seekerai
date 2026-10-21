begin;

create function public.plan_marketing_text_allowed(value text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    regexp_replace(value, 'cart[aã]o de cr[eé]dito', '', 'gi') !~* '\mcr[eé]ditos?\M'
    and (value !~* 'ilimitad[oa]s?' or value ~* 'portf[oó]lio|trabalhos'),
    false
  );
$$;

create function public.valid_plan_card(content jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  key text;
  item jsonb;
  ids text[] := array[]::text[];
  visible_count integer := 0;
begin
  if jsonb_typeof(content) is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(content) as keys(value)
    where value not in ('badge','description','cta','theme','buttonStyle','features')) then return false; end if;
  foreach key in array array['badge','description','cta','theme','buttonStyle'] loop
    if jsonb_typeof(content -> key) is distinct from 'string' then return false; end if;
  end loop;
  if length(trim(content ->> 'badge')) > 40 or length(trim(content ->> 'description')) not between 1 and 180
    or length(trim(content ->> 'cta')) not between 1 and 50
    or content ->> 'theme' not in ('cream','teal','violet','gold')
    or content ->> 'buttonStyle' not in ('solid','light','outline')
    or not public.plan_marketing_text_allowed(content ->> 'badge')
    or not public.plan_marketing_text_allowed(content ->> 'description')
    or not public.plan_marketing_text_allowed(content ->> 'cta') then return false; end if;
  if jsonb_typeof(content -> 'features') is distinct from 'array' then return false; end if;
  if jsonb_array_length(content -> 'features') not between 1 and 12 then return false; end if;
  for item in select value from jsonb_array_elements(content -> 'features') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(item) as keys(value)
      where value not in ('id','text','highlight','visible','icon')) then return false; end if;
    foreach key in array array['id','text','icon'] loop
      if jsonb_typeof(item -> key) is distinct from 'string' then return false; end if;
    end loop;
    if jsonb_typeof(item -> 'highlight') is distinct from 'boolean'
      or jsonb_typeof(item -> 'visible') is distinct from 'boolean' then return false; end if;
    if item ->> 'id' !~ '^[a-z0-9_-]{1,40}$' or item ->> 'id' = any(ids)
      or length(trim(item ->> 'text')) not between 1 and 140
      or not public.plan_marketing_text_allowed(item ->> 'text')
      or item ->> 'icon' not in ('check','bot','sparkles','globe') then return false; end if;
    ids := array_append(ids, item ->> 'id');
    if (item ->> 'visible')::boolean then visible_count := visible_count + 1; end if;
  end loop;
  return visible_count > 0;
end;
$$;

alter table public.plans
  add column landing_visible boolean not null default false,
  add column card_content jsonb not null default '{}'::jsonb,
  add column card_revision integer not null default 0 check (card_revision >= 0),
  add constraint published_card_valid check (not landing_visible or public.valid_plan_card(card_content));

alter policy active_plans_read on public.plans using (ativo or landing_visible);
create policy plans_admin_read on public.plans for select to authenticated using ((select public.is_admin()));

-- Public marketing reads never need wallet allowances or internal plan limits.
revoke select on public.plans from anon;
grant select (id,slug,nome,preco_centavos,ativo,ordem,destaque,landing_visible,card_content,card_revision)
  on public.plans to anon;

create view public.public_plan_cards with (security_invoker = true) as
  select id, slug, nome, preco_centavos, ordem, destaque, card_content, card_revision
  from public.plans where landing_visible;
revoke all on public.public_plan_cards from anon, authenticated;
grant select on public.public_plan_cards to anon, authenticated, service_role;

create function public.configure_plan_card(
  p_plan uuid, p_name text, p_price integer, p_order integer, p_featured boolean,
  p_visible boolean, p_content jsonb, p_revision integer, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous public.plans%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 60 or not public.plan_marketing_text_allowed(p_name)
    or p_price is null or p_price not between 0 and 10000000 or p_order is null or p_order not between 0 and 99
    or p_featured is null or p_visible is null or p_revision is null or p_revision < 0
    or not public.valid_plan_card(p_content) or p_reason is null or length(trim(p_reason)) not between 5 and 300 then
    raise exception 'Invalid plan card configuration' using errcode = '22023';
  end if;
  select * into previous from public.plans where id = p_plan for update;
  if not found then raise exception 'Plan not found' using errcode = 'P0002'; end if;
  if previous.card_revision <> p_revision then
    raise exception 'Plan card was modified by another request' using errcode = '40001';
  end if;
  if previous.slug = 'gratis' and p_price <> 0 then raise exception 'Free plan must remain free' using errcode = '22023'; end if;
  update public.plans set nome = trim(p_name), preco_centavos = p_price, ordem = p_order,
    destaque = p_featured, landing_visible = p_visible, card_content = p_content,
    card_revision = card_revision + 1 where id = p_plan;
  insert into public.audit_log (ator, acao, alvo, diff)
    values (auth.uid(), 'plan_card.updated', p_plan::text, jsonb_build_object(
      'reason', p_reason,
      'before', jsonb_build_object('name', previous.nome, 'price', previous.preco_centavos,
        'order', previous.ordem, 'featured', previous.destaque, 'visible', previous.landing_visible,
        'content', previous.card_content, 'revision', previous.card_revision),
      'after', jsonb_build_object('name', trim(p_name), 'price', p_price, 'order', p_order,
        'featured', p_featured, 'visible', p_visible, 'content', p_content, 'revision', p_revision + 1)
    ));
end;
$$;
revoke all on function public.configure_plan_card(uuid,text,integer,integer,boolean,boolean,jsonb,integer,text) from public, anon;
grant execute on function public.configure_plan_card(uuid,text,integer,integer,boolean,boolean,jsonb,integer,text) to authenticated;
revoke all on function public.plan_marketing_text_allowed(text) from public, anon, authenticated;
revoke all on function public.valid_plan_card(jsonb) from public, anon, authenticated;
grant execute on function public.plan_marketing_text_allowed(text), public.valid_plan_card(jsonb) to service_role;

commit;
