# SeekerAi

Prospecção com direção: encontre quem precisa do que você vende e chegue à
conversa com contexto.

## Estado real

Fundação local e primeira experiência visual. **Não é um SaaS pronto para
produção.** A busca é demonstrativa, com negócios fictícios. Não há autenticação,
busca Places, IA de vendas, pagamentos, envio de mensagens ou portfólio publicado.
As telas de acesso informam isso e não coletam senhas.

Implementado:
- Next.js 15, React 19, TypeScript estrito e Tailwind 4.
- Fontes Sora / DM Sans auto-hospedadas; marca vetorial original.
- Landing responsiva, componentes visuais originais e estados acessíveis.
- Demonstração: serviço/nicho/cidade, ordenação, favoritos temporários, análise,
  cópia de abordagem e modal Radix com navegação de teclado.
- Planos ilustrativos, seleção de PIX/cartão e preservação do plano na rota.
- Páginas de acesso, privacidade, termos e 404; healthcheck.
- Migrações locais: perfis, planos, carteira, ledger, auditoria e segredos.
- Regras configuráveis de créditos, reserva/estorno e bônus de 50 por conta.
- Vinte serviços agrupados, com ferramentas compatíveis por serviço.
- Testes SQL em PostgreSQL embarcado (PGlite), incluindo RLS e RPCs financeiras.
- AES-256-GCM com autenticação de contexto e testes unitários.
- Docker multi-stage, CI de qualidade e detecção de segredos.
- Script de imagens de baixo custo, prompts detalhados e proteção contra retry.

## Rodar

Node 22 LTS ou superior e npm 10+:

```sh
npm ci
npm run dev
```

Abra `http://127.0.0.1:3000`. A demonstração não precisa de credenciais.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Teste de navegador: `npx playwright test`. Localmente usa o Edge já instalado,
sem baixar outro navegador. CI deve instalar Chromium e definir `CI=true`.

## Ambiente

Use `.env.example` como lista de nomes. `.env.local` fica na raiz, ignorado por
Git e Docker. **Nunca** copiar chaves para código, docs, mensagens ou builds.
Next não carrega automaticamente o env da raiz do monorepo; o protótipo não
consome integrações. Ao habilitá-las, exporte o ambiente no processo ou configure
o ambiente do serviço. Não duplique secrets em arquivos de frontend.

No Node 22+, o script de imagens pode ler o arquivo local explicitamente:

```sh
node --env-file=.env.local scripts/gerar-imagens.mjs --id=hero-cosmos
```

Sem `--generate`, isso é apenas inspeção local, sem custo e sem rede.
`--generate` faz uma chamada paga; consulte `docs/PROMPTS-IMAGENS.md`.
O script não repete requisições, não regenera existentes e bloqueia pendências.
A primeira tentativa retornou HTTP 402; nenhuma imagem foi recebida. A segunda
não foi enviada. Não confundir preço anunciado com cobrança confirmada.

## Banco e produção

SQL ainda não aplicado a nenhum projeto remoto. Os testes com PostgreSQL
embarcado verificam isolamento entre usuários, grants e autorização admin com
contexto Auth simulado. Validar também em Supabase local com Auth real antes do
deploy; PGlite não substitui essa etapa.

Não existem remote Git ou domínio definidos nesta pasta. Não há deploy executado.
Docker Desktop precisa estar em execução para testar o container e Supabase local.

Veja `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md` e
`docs/STATUS.md` para decisões, pendências e próximos marcos.
Regras revisadas do produto: `docs/CREDITOS-E-GERACAO.md`.
