begin;

-- Gerar apenas o prompt de imagem (pra usar em IA externa) — grátis,
-- liberado em todos os serviços junto das demais ações.
alter table public.credit_action_rules drop constraint if exists credit_action_rules_action_check;
alter table public.credit_action_rules add constraint credit_action_rules_action_check
  check (action in ('search', 'generate_image', 'generate_site', 'deep_strategy',
                    'sales_reply', 'whatsapp_check', 'lead_assist', 'image_prompt'));

alter table public.services_catalog drop constraint if exists services_catalog_enabled_actions_scope;
alter table public.services_catalog add constraint services_catalog_enabled_actions_scope
  check (enabled_actions <@ array['search', 'deep_strategy', 'sales_reply',
                                  'generate_site', 'generate_image', 'whatsapp_check',
                                  'lead_assist', 'image_prompt']);

insert into public.credit_action_rules (action, cost, enabled) values
  ('image_prompt', 0, true)
on conflict (action) do update set cost = 0, enabled = true;

update public.services_catalog
  set enabled_actions = array_append(enabled_actions, 'image_prompt')
  where ativo and not ('image_prompt' = any(enabled_actions));

alter table public.lead_outputs drop constraint if exists lead_outputs_tipo_check;
alter table public.lead_outputs add constraint lead_outputs_tipo_check
  check (tipo in ('sales_reply', 'deep_strategy', 'generate_site', 'generate_image', 'image_prompt'));

commit;
