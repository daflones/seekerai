begin;

-- Assistente de IA dentro do editor de sites (Pro/King): descreve a
-- mudança em texto/imagem e a IA aplica no HTML. Grátis como o copiloto
-- do lead — quem paga editor já é assinante Pro/King.
alter table public.credit_action_rules drop constraint if exists credit_action_rules_action_check;
alter table public.credit_action_rules add constraint credit_action_rules_action_check
  check (action in ('search', 'generate_image', 'generate_site', 'deep_strategy',
                    'sales_reply', 'whatsapp_check', 'lead_assist', 'image_prompt',
                    'generate_app', 'editor_assist'));

alter table public.services_catalog drop constraint if exists services_catalog_enabled_actions_scope;
alter table public.services_catalog add constraint services_catalog_enabled_actions_scope
  check (enabled_actions <@ array['search', 'deep_strategy', 'sales_reply',
                                  'generate_site', 'generate_image', 'whatsapp_check',
                                  'lead_assist', 'image_prompt', 'generate_app',
                                  'editor_assist']);

insert into public.credit_action_rules (action, cost, enabled) values
  ('editor_assist', 0, true)
on conflict (action) do update set cost = 0, enabled = true;

commit;
