# Arquitetura

## Camadas presentes

- `apps/web/src/app`: App Router, metadata, páginas públicas e healthcheck.
- `apps/web/src/components`: marca, navegação, demonstração, planos e acesso.
- `apps/web/src/lib/catalog.ts`: catálogo estático e gerador fictício determinístico.
- `apps/web/src/lib/service-catalog.ts`: vinte serviços agrupados e capacidades.
- `apps/web/src/lib/billing`: prévias de custos, elegibilidade de redesign e testes SQL.
- `apps/web/src/lib/security`: criptografia server-only, isolada de componentes cliente.
- `supabase/migrations`: fundação de identidade e operações de créditos.
- `scripts/gerar-imagens.mjs`: ferramenta manual de geração, fora da aplicação web.

O app não importa `.env.local` ou scripts na árvore cliente. Apenas componentes
interativos usam `"use client"`. As páginas e a maior parte da landing são
Server Components. Fontes são empacotadas, sem requisições a Google Fonts.

## Dados demonstrativos

Seleção local -> catálogo fictício -> cards -> análise de exemplo.
Favoritos e filtros ficam em estado React, não em banco ou localStorage.
Não há API que aceite o score fictício como dado persistível.
Área de transferência é escrita somente por clique.

## Base de dados preparada

`auth.users` -> trigger -> `profiles` + `credit_wallets`.
O trigger credita o bônus configurado pelo ledger; padrão 50 para contas novas.
`profiles.role` alimenta `is_admin()`; o cliente não pode promover seu perfil.
Carteiras são leitura para o dono e admin. Escrita financeira somente por RPC
com role de serviço, validação no servidor e referência idempotente.
`integration_secrets` não tem grant para usuários, nem mesmo admins no browser.

Uma futura camada admin autenticada deve: validar sessão e role no servidor,
criptografar com contexto `provedor:nome`, gravar apenas o envelope e registrar
auditoria sem valor sensível. Nunca devolver `valor_criptografado` ao cliente.

`credit_action_rules` define preços; `credit_operations` congela custo, hash,
estabelecimento e serviço. Reserva e estorno compartilham lock de carteira e
gravam ledger na mesma transação. `plan_credit_grants` evita duplicar uma
franquia por ciclo. RPCs de execução são service-only; RPCs administrativas
exigem role admin no banco, não uma flag do cliente.

PGlite executa migrations em PostgreSQL embarcado com roles e `auth.uid`
simulados nos testes. Extensão pgcrypto é omitida apenas no harness: a função
core `gen_random_uuid` já existe. Supabase local/Auth real continuam necessários.

## Próximas camadas

Supabase SSR + Turnstile -> auth e permissões -> catálogo persistido ->
pagamentos sandbox e webhooks -> Places/enriquecimento -> IA e cache ->
CRM, sites, chamadas e portfólios -> admin -> hardening/deploy.

Busca real exige reserva e restituição de créditos, limites por usuário/IP,
chaves server-side, termos do Google, atribuição e políticas de retenção.
Fetch de websites exige proteção SSRF e validação em cada redirect; não há fetch
de URLs de empresas nesta versão.
