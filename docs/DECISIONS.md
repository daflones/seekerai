# Decisões

## 2026-10-21 - Escopo verificável

A pasta inicial continha apenas sete referências visuais. Começar com uma
fundação local e uma primeira landing demonstrativa permite validar direção
visual sem ativar serviços de produção. Isso não conclui as fases 1-12 do prompt.
A fase 1 permanece aberta até validar SQL, RLS e ambiente.

## Identidade

Preservar das referências o ritmo entre escuro e claro, a navegação em pílula
e a demonstração concreta. Não reutilizar imagens, logotipo, textos, depoimentos
ou métricas do concorrente. Órbita/radar como símbolo; violeta com ciano pontual;
âmbar somente no King. Sora e DM Sans servidas localmente.

## Integrações

Dados fictícios são identificados como tal. Estados indisponíveis explicam o
motivo, em vez de simular sucesso. Nenhum formulário coleta dados antes de
autenticação, antispam e privacidade validados. Não há cobrança, chamada, envio
de WhatsApp ou busca externa ativada no aplicativo.

## Animações

CSS/SVG no primeiro incremento: entrada do hero, órbitas, gradientes e onda
de áudio. `prefers-reduced-motion` desativa movimento. Framer Motion, GSAP
e Lenis estão disponíveis como dependências, mas não carregados sem necessidade.
Não forçar smooth scrolling JavaScript ou parallax pesado nesta fase.

## Isolamento de builds

Desenvolvimento usa `.next-dev`, produção usa `.next`. O build simultâneo ao
servidor de desenvolvimento compartilhando `.next` gerou referências a chunks
inexistentes, causando 404 com MIME text/plain. Separar as saídas corrige a
causa sem desativar `nosniff` ou relaxar a validação MIME do navegador.

## Dependências transitivas

Audit identificou vulnerabilidades no PostCSS fixado pelo Next 15.
Uma tentativa de override para PostCSS 8.5.31 não alterou a versão transitiva
instalada pelo npm nesta árvore de workspaces. O override inefetivo foi removido.
Não rodar `npm audit fix --force`: ele propõe Next 16, contrariando a major
solicitada. Pendência de release: validar solução efetiva ou aprovar upgrade.
O audit de produção permanece com uma vulnerabilidade alta e uma moderada;
o protótipo não deve ser divulgado como pronto para produção.

## Runtime

Next.js 15 conforme pedido. Docker/CI usam Node 22 LTS em vez de Node 20:
na data deste trabalho, Node 20 já encerrou suporte. Desenvolvimento local
foi realizado com Node 24. Não fixar um runtime sem suporte por fidelidade
literal ao documento.

## Segurança

Chaves do documento original foram importadas diretamente para `.env.local`
ignorado, sem copiar para arquivos versionáveis. OpenRouter permanece server-side.
Secrets em banco usam AES-256-GCM com IV aleatório de 96 bits e AAD contendo
provedor/nome, impedindo troca de envelopes entre integrações.

Usuários não recebem grants para alterar `role`, consentimento, carteira ou
ledger. RPCs financeiras só podem ser invocadas por `service_role`. O backend
futuro deve validar sessão, autorização, limites e o usuário alvo antes da RPC.
O ledger serializa mudanças por carteira, valida idempotência e saldo.
Não habilitar créditos por retorno do checkout.

## Dados e consentimento

O trigger de perfil não aceita role ou consentimento enviados em metadata.
Consentimento é nulo até ser registrado pelo fluxo validado de cadastro.
Não criar uma data de consentimento apenas porque houve uma conta OAuth.
Seed com planos inativos até validação comercial.

## Imagens e custo

Consulta pública aos modelos e endpoints de imagem; menor preço fixo encontrado:
Recraft v4.1 Flash, USD 0.007/imagem. O usuário autorizou gerar imagens e depois
pediu o menor custo possível. Duas imagens planejadas, uma por chamada, sem
retry, fallback pago ou upscaling pago.

A primeira chamada retornou HTTP 402. A segunda não foi enviada. A consulta
de créditos retornou saldo aproximado de USD 0.166; o motivo exato da recusa
não foi inferido apenas do código HTTP. Requer conferência no painel do provedor
antes de nova tentativa. Fallback CSS/SVG não depende da API.

Script inicial em ESM `.mjs` para rodar no Node sem compilador adicional.
Storage Supabase e controle de geração pelo admin ficam para a fase de imagens;
não enviar assets ao banco remoto antes de provisionar storage/policies.

## Deploy e Git

Sem remote Git fornecido, nenhum push é possível. Sem Docker daemon, não
declarar container validado. Não aplicar migrações no projeto de produção
sem testar o banco local. Cabeçalhos básicos implementados; CSP com nonce,
HSTS de produção, rate limiting e hardening completo ainda são pendências.

## Regras revisadas pelo usuário

O bônus de cadastro agora é de 50 créditos, sem expiração presumida. A busca
custa 4, por ser a última base explícita na mensagem; site custa 5 e imagem 2,
sempre por estabelecimento. Estratégia e conversa aguardam tarifa e ficam
desabilitadas. Custos e franquias de planos são configuráveis por RPC admin
com auditoria; sua UI ainda não foi construída.

Créditos saíram do marketing, inclusive FAQ e benefícios numéricos de planos.
Somente a prévia `/explorar` apresenta a regra, sem debitar ou executar IA.
Não anunciar agente ilimitado e depois cobrar mensagens sem esclarecimento.

Catálogo ampliado para vinte serviços em três grupos. Capacidades são explícitas,
evitando oferecer geração de site para edição de vídeo ou fotografia sintética
como substituto do serviço de fotógrafo.

Testes com PGlite validam migrations reais, grants e RLS com Auth simulado,
sem depender do Docker indisponível. Isso não substitui testes Supabase/GoTrue
com sessões e webhooks reais antes do release.

## Autenticação e captcha nativo

Auth usa Supabase SSR, sem SDK de sessão no browser. Cookies podem ser HttpOnly
porque todos os acessos autenticados acontecem no servidor. O captcha de
login/cadastro/recuperação é validado uma única vez pelo GoTrue nativo; validação
apenas no Next deixaria a API pública do provedor contornável.

O widget/script compartilha configuração entre login e cadastro, mas tokens
single-use não persistem. Ações autenticadas sem captcha nativo usam Siteverify
com hostname/action. Rate limit usa HMAC e banco, sem fallback em memória que
falharia em múltiplas instâncias.

Admin é uma role no perfil, não uma lista de e-mails no frontend. Bootstrap é
service-only, auditado e idempotente, não altera senha de conta existente e não
aceita Termos pelo titular. Os dados de bootstrap só entram no ambiente temporário
do processo depois da autorização. O provisionamento remoto foi executado com
autorização: migrations sem destruição, captcha nativo e role confirmada no banco.

`SUPABASE_AUTH_READY` falha fechado até confirmar schema e captcha no provedor.
SDK/cookies são testados ponta a ponta com provedor local isolado; isso não
substitui validação no domínio Cloudflare e entrega real do e-mail.

Em dev, o `NextURL` do Next normaliza `127.0.0.1` para `localhost` ao montar
`request.nextUrl` e reescreve redirects de middleware para esse host. Cookies
HttpOnly host-only não atravessam entre os dois hosts, então testes e uso local
devem usar `localhost` consistentemente. Ver `docs/AUTH.md`.

## Edge Functions e secrets de provedores

Chamadas a provedores pagos (Stripe, MercosulPay, Google Places, OpenRouter,
Evolution) passam por Supabase Edge Functions, e os secrets ficam em
`supabase secrets` — o Easypanel só carrega variáveis do app. Racional: os
provedores chamam nossa infra por webhooks que não podem carregar JWT, então a
função pública se autentica pela assinatura HMAC do provedor (`verify_jwt =
false` apenas nos webhooks); funções chamadas pelo app exigem JWT e validam o
usuário no servidor.

Toda mutação de pagamento acontece em RPCs `security definer` service-only:
`confirm_plan_payment` lê `user_id`/`plan_id` da linha `payments` criada no
checkout — o payload do provedor nunca escolhe beneficiário. Idempotência por
`webhook_events (provider, event_id)` e `payments (provider, provider_ref)`.
Para PIX da MercosulPay, `provider_ref` é a referência interna gerada por nós,
ecoada pelo webhook via `external_reference` — evita depender do formato de ID
do provedor.
