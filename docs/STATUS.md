# Estado da entrega

## Implementado localmente

- Estrutura monorepo Next 15 / TypeScript estrito / Tailwind 4.
- Landing original e responsiva, baseada na análise das sete referências.
- Busca demonstrativa interativa; estados salvos, vazios e análise.
- Quatro planos ilustrativos; modalidade e plano selecionável.
- Estados de acesso sem captura de senha; textos legais da demonstração.
- Marca/favicons SVG, fontes locais e animações com reduced-motion.
- Criptografia AES-256-GCM, catálogo e testes unitários.
- Migrações de fundação e créditos; seed inativo.
- CI, Dockerfile e healthcheck; documentação inicial.
- Script de imagem econômico, prompts detalhados e prevenção de retry.
- Catálogo com 20 serviços e compatibilidade de geração por serviço.
- Regras internas: bônus 50, busca 4, imagem 2, site 5; nada na landing.
- Reserva/estorno idempotente por ação e créditos do plano por ciclo.
- RPCs admin de custo, bônus e franquia, com verificação de role e auditoria.
- Testes de migrations e RLS em PostgreSQL embarcado com Auth simulado.
- Fluxos locais de auth Supabase SSR, Turnstile, confirmação e recuperação.
- Guardas de sessão e role em `/app` e `/admin`, cookies HttpOnly e logout.
- Rate limit persistente, proteção CSRF, onboarding e consentimento versionado.
- Script de configuração remota e bootstrap admin sem senha em código.
- Provisionamento remoto executado com autorização: migrations 001–008
  aplicadas sem destruição, confirmação de e-mail e Turnstile nativo ativos,
  conta admin promovida e confirmada no banco, carteira com bônus de 50.
- Cards de plano persistidos e editáveis no admin (`/admin/planos`) com prévia
  ao vivo, auditoria e publicação na landing via `public_plan_cards`.
- Vitest 4 e `overrides` de PostCSS: advisories de tinypool/mocker e do pin
  aninhado `postcss@8.4.31` do Next resolvidos.

## Produto no app (entregue)

- `/app/buscar`: busca real via `places-search` (Apify/Places, replay admin),
  cards com sinal de oportunidade ("sem site"), salvar lead em um clique.
- `/app/leads` + `/app/leads/[id]`: CRM com pipeline (novo→ganho/perdido),
  notas, verificação de WhatsApp, geração de mensagem/estratégia/site com IA
  persistida em `lead_outputs`, abrir/baixar o HTML do site.
- `/app/planos`: checkout real — cartão via Stripe Checkout ou PIX MercosulPay
  com QR/copia-e-cola na tela.
- `/api/actions`: proxy autenticado que injeta o JWT do usuário nas edge
  functions; `/api/leads`: CRUD do CRM. Migration 012 (`leads`, `lead_outputs`)
  com RLS por dono.

## Não concluído

- Teste manual de captcha/SMTP no domínio; Google OAuth e exportação/exclusão LGPD.
- Pagamentos: webhooks cadastrados e secrets configurados; falta testar
  cobrança real de ponta a ponta (sandbox Stripe + PIX MercosulPay).
- Enriquecimento/score composto, filtros completos e mapa nos resultados.
- IA: `generate_image` sem tela própria; OpenRouter com saldo baixo — a
  geração de imagem do pipeline de site só foi testada com saldo insuficiente.
- Custos de `sales_reply` (1), `deep_strategy` (3) e `whatsapp_check` (1)
  ativados no remoto; reajustáveis em `/admin/integracoes`.
- Conectar o catálogo persistido ao app; completar nichos e seed IBGE.
- Cidades em alta e cron.
- Sites publicados (hospedagem dos HTMLs gerados) e streaming.
- Captura consentida/STT/copiloto em tempo real e agente.
- Exportação CSV de leads e portfólio público.
- Storage e catálogo persistido de imagens geradas.
- CSP/HSTS, observabilidade e revisão de segurança.
- SEO com domínio definitivo, sitemap, robots, OG final e analytics consentidos.
- Deploy Easypanel validado (build do lightningcss corrigido; pendente
  redeploy + DNS + Turnstile hostname) e Lighthouse.

## Bloqueios externos

- OpenRouter Image API retornou 402 na primeira tentativa, sem imagem.
- Docker Desktop daemon não está disponível nesta sessão.
- Nenhum remote Git/Easypanel fornecido.
- Faltam secrets `GOOGLE_PLACES_API_KEY`, `EVOLUTION_*` e `*_WEBHOOK_SECRET`
  (Stripe/MercosulPay) no Supabase; STT ainda não integrado.
- Segredos internos foram gerados localmente; nunca publicados.
- Identificação legal e canal de privacidade precisam ser definidos.
- `braces` (dev, via eslint) tem advisory sem versão corrigida na linha 3.x.

Não publicar como produção ou anunciar recursos ainda não conectados.

## Verificação local - 2026-10-21

- Lint sem warnings e typecheck aprovados.
- 64 testes unitários aprovados (Vitest 4), incluindo migrations em PGlite.
- Build Next 15 de produção aprovado com 18 rotas.
- 12 testes públicos e 12 de autenticação aprovados: desktop e mobile.
- E2E cobre login cookie HttpOnly, bloqueio de role falsa no navegador,
  edição de plano no admin refletida na landing e CSRF rejeitado na API.
- Regressão de assets: dev e build em diretórios separados, sem 404/MIME incorreto.
- Nenhum valor do ambiente encontrado nos arquivos versionáveis pela checagem local.
- Docker segue como pendência descrita acima.
