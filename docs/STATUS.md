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

## Não concluído

- Fase 1: validar SQL/RLS em Supabase local com Auth real, link e push Git.
- Auth real, Turnstile, Google OAuth, recuperação, exportação/exclusão LGPD.
- Pagamentos sandbox, webhooks assinados e idempotentes.
- Busca Places oficial, enriquecimento, score real, filtros completos e mapa.
- Conectar o catálogo persistido ao app; completar nichos e seed IBGE.
- Cidades em alta e cron.
- IA de análise/abordagem, sites publicados e streaming.
- Captura consentida/STT/copiloto em tempo real e agente.
- CRM persistente, exportação CSV e portfólio público.
- Admin, chaves no banco, testes de conexão e auditoria da UI.
- Storage e catálogo persistido de imagens geradas.
- Rate limiting, CSP/HSTS, observabilidade e revisão de segurança.
- SEO com domínio definitivo, sitemap, robots, OG final e analytics consentidos.
- Deploy Easypanel e validação Lighthouse.
- Resolver advisory transitivo de PostCSS no Next 15 (audit: alta + moderada).

## Bloqueios externos

- OpenRouter Image API retornou 402 na primeira tentativa, sem imagem.
- Docker Desktop daemon não está disponível nesta sessão.
- Nenhum remote Git/domínio/Easypanel fornecido.
- Faltam Google Places, Evolution, Turnstile, webhooks e STT.
- Segredos internos foram gerados localmente; nunca publicados.
- Identificação legal e canal de privacidade precisam ser definidos.

Não publicar como produção ou anunciar recursos ainda não conectados.

## Verificação local - 2026-10-21

- Lint sem warnings e typecheck aprovados.
- 30 testes unitários/SQL aprovados, incluindo as cinco migrations em PGlite.
- Build Next 15 de produção aprovado.
- 12 testes de navegador aprovados: desktop e mobile via Edge/Chromium.
- Regressão de assets: build executado com dev ativo; CSS/JS válidos, sem 404/MIME incorreto.
- Catálogo, ferramentas por serviço, ausência de custos na landing e reduced-motion testados.
- Nenhum valor do ambiente encontrado nos arquivos versionáveis pela checagem local.
- Docker, Auth real, ambiente Supabase e audit de dependências seguem com as pendências descritas.
