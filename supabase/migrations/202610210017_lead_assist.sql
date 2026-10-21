begin;

-- Copiloto de conversão por lead: grátis, habilitado em todos os serviços.
alter table public.credit_action_rules drop constraint if exists credit_action_rules_action_check;
alter table public.credit_action_rules add constraint credit_action_rules_action_check
  check (action in ('search', 'generate_image', 'generate_site', 'deep_strategy',
                    'sales_reply', 'whatsapp_check', 'lead_assist'));

alter table public.services_catalog drop constraint if exists services_catalog_enabled_actions_scope;
alter table public.services_catalog add constraint services_catalog_enabled_actions_scope
  check (enabled_actions <@ array['search', 'deep_strategy', 'sales_reply',
                                  'generate_site', 'generate_image', 'whatsapp_check',
                                  'lead_assist']);

insert into public.credit_action_rules (action, cost, enabled) values
  ('lead_assist', 0, true)
on conflict (action) do update set cost = 0, enabled = true;

update public.services_catalog
  set enabled_actions = array_append(enabled_actions, 'lead_assist')
  where not ('lead_assist' = any(enabled_actions));

commit;
