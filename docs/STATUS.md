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

## Não concluído

- Fase 1: validar SQL/RLS em Supabase local com Auth real, link e push Git.
- Teste manual de captcha/SMTP no domínio; Google OAuth e exportação/exclusão LGPD.
- Pagamentos sandbox, webhooks assinados e idempotentes.
- Busca Places oficial, enriquecimento, score real, filtros completos e mapa.
- Conectar o catálogo persistido ao app; completar nichos e seed IBGE.
- Cidades em alta e cron.
- IA de análise/abordagem, sites publicados e streaming.
- Captura consentida/STT/copiloto em tempo real e agente.
- CRM persistente, exportação CSV e portfólio público.
- Admin de integrações/chaves no banco, testes de conexão e auditoria da UI.
- Storage e catálogo persistido de imagens geradas.
- Rate limiting, CSP/HSTS, observabilidade e revisão de segurança.
- SEO com domínio definitivo, sitemap, robots, OG final e analytics consentidos.
- Deploy Easypanel e validação Lighthouse.

## Bloqueios externos

- OpenRouter Image API retornou 402 na primeira tentativa, sem imagem.
- Docker Desktop daemon não está disponível nesta sessão.
- Nenhum remote Git/Easypanel fornecido.
- Faltam Google Places, Evolution, webhooks e STT.
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
