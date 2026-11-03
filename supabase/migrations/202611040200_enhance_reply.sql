begin;

-- "Aprimorar com IA" no chat do admin: reescreve a resposta de
-- atendimento com tom profissional e info completa. Grátis e restrito
-- a admin (o gate vive na /api/actions e na edge).
alter table public.credit_action_rules drop constraint if exists credit_action_rules_action_check;
alter table public.credit_action_rules add constraint credit_action_rules_action_check
  check (action in ('search', 'generate_image', 'generate_site', 'deep_strategy',
                    'sales_reply', 'whatsapp_check', 'lead_assist', 'image_prompt',
                    'generate_app', 'editor_assist', 'enhance_reply'));

alter table public.services_catalog drop constraint if exists services_catalog_enabled_actions_scope;
alter table public.services_catalog add constraint services_catalog_enabled_actions_scope
  check (enabled_actions <@ array['search', 'deep_strategy', 'sales_reply',
                                  'generate_site', 'generate_image', 'whatsapp_check',
                                  'lead_assist', 'image_prompt', 'generate_app',
                                  'editor_assist', 'enhance_reply']);

insert into public.credit_action_rules (action, cost, enabled) values
  ('enhance_reply', 0, true)
on conflict (action) do update set cost = 0, enabled = true;

commit;
