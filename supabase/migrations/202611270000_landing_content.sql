begin;

create function public.configure_landing_content(p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_value) is distinct from 'object'
     or jsonb_typeof(p_value -> 'video_enabled') is distinct from 'boolean'
     or jsonb_typeof(p_value -> 'video_urls') is distinct from 'object'
     or jsonb_typeof(p_value -> 'showcase_slugs') is distinct from 'array' then
    raise exception 'Invalid landing content' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_value) k where k not in ('video_enabled', 'video_urls', 'showcase_slugs'))
     or exists (
       select 1 from jsonb_each(p_value -> 'video_urls') e
       where e.key not in ('pt', 'en', 'es', 'fr', 'de', 'it')
          or jsonb_typeof(e.value) <> 'string'
          or length(e.value #>> '{}') > 1000
          or ((e.value #>> '{}') <> '' and (e.value #>> '{}') !~ '^https://')
     )
     or jsonb_array_length(p_value -> 'showcase_slugs') > 8
     or exists (
       select 1 from jsonb_array_elements(p_value -> 'showcase_slugs') s
       where jsonb_typeof(s) <> 'string' or (s #>> '{}') !~ '^[a-z0-9-]{2,80}$'
     ) then
    raise exception 'Invalid landing content values' using errcode = '22023';
  end if;
  if (p_value ->> 'video_enabled')::boolean and not exists (
    select 1 from jsonb_each_text(p_value -> 'video_urls') e where length(trim(e.value)) > 0
  ) then
    raise exception 'Video URL required' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements_text(p_value -> 'showcase_slugs')) <>
     (select count(distinct s) from jsonb_array_elements_text(p_value -> 'showcase_slugs') s) then
    raise exception 'Duplicate showcase site' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_value -> 'showcase_slugs') s
    where not exists (select 1 from public.sites where slug = s and publicado = true)
  ) then
    raise exception 'Showcase requires published sites' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_by)
    values ('landing_content', p_value, (select auth.uid()))
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (ator, acao, alvo, diff)
    values ((select auth.uid()), 'app_setting:update', 'landing_content', jsonb_build_object('value', p_value));
end;
$$;

revoke all on function public.configure_landing_content(jsonb) from public, anon;
grant execute on function public.configure_landing_content(jsonb) to authenticated, service_role;

commit;
