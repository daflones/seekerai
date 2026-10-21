# Autenticação Supabase + Cloudflare Turnstile

## Estado

Implementação local de login, cadastro, confirmação, recuperação, nova senha,
onboarding, sessão SSR, logout e proteção de `/app`/`/admin`.
O provisionamento remoto foi executado: migrations aplicadas sem destruição,
confirmação de e-mail e Turnstile nativo ativos e conta admin promovida.
`SUPABASE_AUTH_READY=false` mantém os envios bloqueados até a configuração.

URL canônica configurada no ambiente local: `https://eletrify.me`.
Nenhuma senha de admin consta em código, migrations, docs ou env versionado.

## Captcha: proteção no provedor

Login, cadastro e recuperação enviam `captchaToken` ao CAPTCHA NATIVO do Supabase.
Isso é necessário porque a API pública do GoTrue pode ser acessada sem passar
pelo formulário do Next. Apenas um bloqueio visual ou validação no Next não
impediria esse bypass.

Não chamar Siteverify antes de encaminhar o mesmo token ao Supabase: o token
Turnstile é de uso único e a segunda verificação falharia.

Nova senha e onboarding, que já exigem sessão, usam Siteverify no servidor,
validando `success`, hostname e action. Não há bypass de captcha em produção.
Nos testes, o provedor e o widget são fixtures locais isoladas, não flags
de dispensa no código da aplicação.

O script e a site key são compartilhados na troca login/cadastro. O token não
é armazenado em localStorage/cookies e não persiste entre tentativas. Cada envio,
falha, expiração ou mudança de fluxo exige um token novo.

Em desenvolvimento o widget usa `appearance: "interaction-only"`: o desafio
continua real e verificado pelo GoTrue, mas a caixa só aparece quando a
Cloudflare exige interação — na maior parte do tempo o token chega sem clique.
Não desligar o captcha em dev: o projeto Supabase valida nativamente e um token
falso ou ausente falharia com `captcha_failed` no login/cadastro/recuperação.
Em produção a aparência padrão permanece.

No painel Cloudflare, permitir `eletrify.me` e os hosts de desenvolvimento
usados (`localhost`, `127.0.0.1`). Caso utilize `www`, ele também precisa ser
configurado explicitamente. Site key/secret não permitem alterar esse allowlist;
isso exige acesso ao painel ou uma credencial de gestão da conta Cloudflare.

## Provisionamento após autorização

Inspeção local sem rede:

```sh
node scripts/setup-supabase.mjs
```

Operação remota explícita:

```sh
node --env-file=.env.local scripts/setup-supabase.mjs --apply --schema --auth --admin
```

O processo precisa receber `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD`
como variáveis temporárias. Não escrever a senha na linha de comando, no repo
ou no histórico do shell. O agente pode passá-la pelo ambiente do processo.

O script:
1. Confere URL/referência do projeto e exige HTTPS no domínio canônico.
2. Aplica apenas migrations não registradas, sem reset, drop ou truncate.
3. Configura confirmação de e-mail, senha mínima e captcha Turnstile nativo.
4. Preserva redirects existentes e adiciona callbacks do domínio e localhost.
5. Cria o admin com e-mail confirmado, sem enviar e-mail de teste.
6. Se a conta já existir, preserva senha e confirmação; não redefine credenciais.
7. Promove via RPC service-only com auditoria atômica e confirma a role no banco.
8. Não aceita Termos em nome do titular; o primeiro acesso pede completar perfil.
9. Libera `SUPABASE_AUTH_READY` local somente depois da configuração e promoção.

O passo de Auth altera a configuração de captcha do projeto Supabase inteiro,
podendo afetar outros clientes que utilizem esse mesmo projeto. Revisar antes
de executar. Se houver tabelas preexistentes conflitantes sem histórico de
migrations, a aplicação falha e requer conciliação: não apagar dados para forçar.

No deploy, configurar as mesmas variáveis no serviço e fazer novo build. A chave
pública Turnstile pode ser entregue ao navegador; a secret e a service key não.
Reiniciar o servidor local após provisionar: o env é carregado na configuração
do Next a partir da raiz do monorepo.

## Sessão e autorização

- Supabase SSR com cookies HttpOnly, SameSite=Lax, Secure em produção.
- `getUser()` valida a sessão no provedor; não confiar em `getSession()` isolado.
- Middleware renova cookies e bloqueia anônimos; páginas/layouts repetem a guarda.
- Admin exige `profiles.role = 'admin'` no servidor. E-mail, metadata e cookie
  `role=admin` não concedem acesso.
- Rotas privadas não são cacheadas e não são indexadas.
- Login/logout fazem navegação de documento após alterar cookies, evitando
  estado RSC antigo de outra sessão.
- CSRF por Origin exato, JSON obrigatório, corpo limitado a 16 KiB e redirects
  restritos à plataforma. A URL de produção não é derivada de Host arbitrário.

## Abuso e consentimento

Rate limit persistente por conta e IP confiável, com chaves HMAC e RPC service-only.
Sem proxy confiável, utiliza bucket agregado conservador. Só habilitar
`TRUST_PROXY_HEADERS=true` se o proxy remover/substituir headers enviados pelo
cliente. Nunca assumir que um `X-Forwarded-For` recebido da Internet é legítimo.
Monitorar e expurgar buckets expirados por tarefa de manutenção futura.

Cadastro valida nome, telefone, e-mail, senha e aceite obrigatório. Marketing é
opcional e inicia desmarcado. O servidor registra versão/data do aceite depois
de obter o ID autenticado do provedor. Cadastro repetido não sobrescreve o aceite
de uma conta existente. Uma conta criada fora do formulário precisa concluir o
perfil para acessar o app. Metadata nunca concede role ou consentimento.

Contas novas recebem o bônus via trigger/ledger já existente. Login, confirmação,
recuperação e completar perfil não concedem o bônus outra vez.

## Testes e operação

```sh
npm run typecheck
npm test
npm run test:auth:e2e
```

Os e2e usam `http://localhost:3100` e um provedor local na 54329 — não
`127.0.0.1`. Motivo: o `NextURL` do Next.js normaliza `127.0.0.1` para
`localhost` (`next/dist/server/web/next-url.js`), então redirects de
middleware e de `redirect()` em layouts saem absolutos para `localhost` em
dev. Como cookies são host-only, a sessão criada em `localhost` não volta
para `127.0.0.1`, quebrando o fluxo autenticado. O mesmo vale para o dev
manual: acesse sempre `http://localhost:3000`, nunca `127.0.0.1:3000`.
Em produção o origin canônico (`NEXT_PUBLIC_APP_URL`) governa os redirects,
sem depender desse detalhe de desenvolvimento.

Os e2e executam Next na porta 3100 e um provedor local na 54329, usando o SDK
Supabase real, cookies reais e um widget simulado. Não usam credenciais reais,
não enviam e-mails, não resolvem captchas reais e não criam contas no projeto.
Teste manual no domínio autorizado ainda é obrigatório.

O callback PKCE padrão usa `/auth/callback`. Para templates personalizados,
`/auth/confirm?token_hash=...&type=email` também é suportado. Recovery usa
`type=recovery` ou o callback com `recovery=1`. Links são de uso único.
Logs de acesso no proxy/hospedagem devem omitir a query de `/auth/*`; no dev,
esses endpoints foram excluídos do request logging.

Antes de abrir ao público: revisão jurídica, controlador/canal de privacidade,
exportação/exclusão LGPD, SMTP/entrega real e allowlist de domínio.
Considere MFA para o administrador.

Resíduo de `npm audit`: `braces` (via `eslint-config-next` → fast-glob →
micromatch) tem advisory sem versão corrigida na linha 3.x; é dependência de
desenvolvimento do lint, não vai para produção e os padrões de glob são
controlados pelo repositório. O pin aninhado `postcss@8.4.31` do Next foi
resolvido com `overrides` no package.json raiz; Vitest foi atualizado para
4.x cobrindo os advisories de tinypool/mocker.
