# Operação

## Desenvolvimento

1. Instale Node 22 LTS e execute `npm ci`.
2. Rode `npm run dev`; use `http://localhost:3000` (o Next normaliza
   `127.0.0.1` para `localhost` em redirects; cookies são host-only).
3. Execute lint, typecheck, testes e build antes de cada commit.
4. Confira `git status --ignored` e nunca inclua `.env.local`.

## Banco local

Docker Desktop deve estar iniciado. Instale Supabase CLI pelo canal oficial,
rode `supabase start` e aplique as migrations apenas no ambiente local.
O seed não ativa planos. Verifique isolamento com duas contas reais de teste:
A não lê B; A não altera role; A não chama operações financeiras; o ledger
recusa débito sem saldo e referências conflitantes.

SQL não foi aplicado no projeto remoto. Backups, revisão e validação local
são pré-condições para `db push`. Não rodar comandos de reset contra produção.

## Container e Easypanel

```sh
docker build -t seekerai:local .
docker run --rm -p 3000:3000 seekerai:local
```

Healthcheck: `GET /api/health` retorna somente o estado do processo, não atesta
saúde de integrações. Não embutir secrets na imagem. Configure ambiente no
serviço Easypanel.

### Deploy Easypanel (Dockerfile na raiz)

1. App → Source GitHub `daflones/seekerai`, branch `main`, build `Dockerfile`.
2. Porta interna 3000. O healthcheck já está na imagem (`/api/health`).
3. Variáveis de ambiente (runtime; nenhuma é necessária no build):
   `NEXT_PUBLIC_APP_URL` (https do domínio final), `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`,
   `APP_ENCRYPTION_KEY`, `AUTH_RATE_LIMIT_SECRET`, `INTERNAL_CRON_SECRET`,
   `SUPABASE_AUTH_READY=true` e `TRUST_PROXY_HEADERS=true` (o Traefik do
   Easypanel controla os headers de proxy).
4. No painel Cloudflare, o widget Turnstile precisa permitir o hostname do
   domínio de deploy; no Supabase Auth, registrar a URL e o callback
   `/auth/callback` desse mesmo domínio nas URLs permitidas.
5. Guarde o digest da imagem anterior para rollback. Rollback de app não
   desfaz schema; migrações devem manter compatibilidade.

Subdomínios de demos `*.demo.<dominio>` só devem ser ativados após implementar
publicação, isolamento, sandbox, DNS wildcard e certificado correspondente.

## Edge Functions e secrets de provedores

Secrets de provedores (Stripe, MercosulPay, Google Places, OpenRouter,
Evolution) ficam no Supabase — **não** no Easypanel. Sincronize e faça deploy:

```sh
node scripts/deploy-edge.mjs            # secrets + functions
node scripts/deploy-edge.mjs --secrets  # só secrets
```

O script lê `.env.local`, grava `supabase/.env.edge` (gitignored) e executa
`supabase secrets set` + `supabase functions deploy` no projeto remoto.

| Function            | Auth                  | Uso                                    |
| ------------------- | --------------------- | -------------------------------------- |
| `stripe-webhook`    | assinatura Stripe     | confirma/renova/cancela assinatura     |
| `mercosulpay-webhook` | assinatura Mercosul | confirma pagamento PIX                 |
| `billing-checkout`  | JWT do usuário        | cria checkout Stripe ou cobrança PIX   |
| `places-search`     | JWT do usuário        | Google Places (consome `search`)       |
| `ai-generate`       | JWT do usuário        | OpenRouter (estratégia/mensagem/site/imagem) |
| `whatsapp-check`    | JWT do usuário        | Evolution (verificação de número)      |

Webhooks a cadastrar nos provedores (apontam para `functions/v1/<nome>`):

- Stripe → `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
  (eventos: `checkout.session.completed`, `invoice.paid`,
  `customer.subscription.deleted`)
- MercosulPay → `https://<project-ref>.supabase.co/functions/v1/mercosulpay-webhook`

Após cadastrar, copie os webhook secrets para `.env.local`
(`STRIPE_WEBHOOK_SECRET`, `MERCOSULPAY_WEBHOOK_SECRET`) e rode
`node scripts/deploy-edge.mjs --secrets` de novo. Enquanto o secret não estiver
configurado, o webhook responde 500/401 — comportamento esperado.

Dedup de eventos é garantido por `webhook_events (provider, event_id)`; evento
com falha anterior é reprocessado (status `retry`). Mutações só via RPCs
service_role (`confirm_plan_payment`, `record_renewal_payment`,
`cancel_provider_subscription`) — o payload do provedor nunca decide quem
recebe créditos.

## Geração de imagens

Inspecione os prompts sem custo:

```sh
node --env-file=.env.local scripts/gerar-imagens.mjs --id=hero-cosmos
```

Só adicione `--generate` quando houver autorização para uma chamada paga.
Teto verificado: USD 0.007/imagem no modelo aprovado. Se o preço publicado
mudar, o script falha fechado. Os arquivos `.pending` evitam repetição após
timeout/erro com possível cobrança. Não exclua a pendência sem conferir
histórico no provedor. Não há retry automático.

O endpoint retornou 402 na tentativa inicial. Conferir saldo, limite da chave
e disponibilidade do provedor antes de uma nova tentativa autorizada.

## Segurança e incidentes

- Rotacionar credenciais que tenham circulado em documentos ou conversas.
- Nunca imprimir ambiente completo, resposta de credenciais ou headers.
- Não usar tokens LIVE para testes de pagamento.
- Se uma chave for exposta, revogar no provedor e substituir no ambiente.
- A chave mestra de criptografia precisa de backup seguro; trocá-la sem
  recriptografar envelopes torna os segredos existentes ilegíveis.
