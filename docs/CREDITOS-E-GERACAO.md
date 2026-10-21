# Regras atualizadas - créditos e geração contextual

Pedido do usuário em 2026-10-21. Este documento substitui as regras de trial
e uso ilimitado do super-prompt original onde houver conflito.

## Regras decididas

| Ação | Valor inicial | Escopo |
| --- | --- | --- |
| Cadastro | +50 | Uma única bonificação por conta nova |
| Busca | -4 | Uma cobrança para a busca, não por estabelecimento retornado |
| Criar imagem | -2 | Uma geração para um estabelecimento |
| Criar site | -5 | Uma geração para um estabelecimento |
| Estratégia aprofundada | Sem tarifa definida | Desabilitada até configuração do admin |
| IA para conversas | Sem tarifa definida | Desabilitada até configuração do admin |
| Créditos do plano | Configurados no admin | Cada ciclo de pagamento confirmado |

Foi mencionado 5 por busca no começo da mensagem e 4 como base no final.
Adotado o último valor explícito: **4**. Todos os valores são configuráveis
no admin. Nenhum custo ou quantidade de créditos aparece na landing.
Os valores exibidos em `/explorar` são somente uma prévia sem débito.

Os planos do seed têm 150/300/700 como valores iniciais para Essencial/Pro/King,
mas a quantidade real deve vir do banco. O Grátis não ganha uma franquia mensal
adicional automaticamente; recebe o bônus de cadastro. Não zerar saldo, expirar
créditos ou substituir o saldo por uma franquia sem regra comercial explícita.

## Implementação presente

1. `credit_settings`: bônus inicial, configurável e auditado.
2. `credit_action_rules`: custo e habilitação de cada ação.
3. `services_catalog`: 20 serviços e ações compatíveis.
4. `credit_operations`: custo congelado, escopo, hash de entrada e idempotência.
5. RPC de reserva: trava carteira, valida serviço, consulta tarifa atual e debita
   pelo ledger na mesma transação.
6. RPC de finalização: completa ou restitui o custo original, uma única vez.
7. `plan_credit_grants`: franquia de plano congelada por ciclo, sem duplicação.
8. RPCs de configuração: validam role no banco e registram antes/depois/motivo.
9. Testes em PostgreSQL embarcado cobrem migrations, RLS, bônus, idempotência,
   isolamento, saldo, estorno, mudança de preços e franquia de plano.

As migrations ainda não foram aplicadas ao Supabase remoto. A interface admin,
autenticação e endpoints de execução ainda não estão implementados.
Não confundir o modelo e os testes com integrações já disponíveis.

## Fluxo futuro de execução

1. Validar sessão, confirmação de e-mail, consentimento, plano e rate limit.
2. Resolver empresa pertencente ao usuário, serviço e ação no servidor.
3. Verificar integração/modelo antes de reservar. Sem chave, não debitar.
4. Mostrar custo vigente e pedir confirmação. O valor do cliente não autoriza
   cobrança; a RPC usa a configuração do banco.
5. Gerar hash canônico SHA-256 da entrada validada, incluindo escopo, prompt
   versionado e revisões. Uma mudança de parâmetros não reutiliza o mesmo ID.
6. Reservar com referência idempotente e enfileirar job único por operação.
7. Worker faz claim transacional com lease antes de chamar o provedor.
8. Validar/persistir entrega e só então marcar como concluída.
9. Se não houver entrega, estornar uma única vez; resultado incerto por timeout
   fica pendente de reconciliação, sem retry cego ou estorno prematuro.

**Idempotência de créditos não impede sozinha chamadas duplicadas ao provedor.**
A fila persistente/lease ainda precisa ser implementada antes de conectar a IA.
Não executar uma chamada nova toda vez que a RPC devolver uma reserva existente.
Uma nova geração voluntária exige novo ID e confirmação explícita de custo.

`grant_plan_allowance` é service-only e só pode ser chamado por processamento
de pagamento autenticado/confirmado. Não o expor em botão ou retorno de checkout.
O valor do ciclo é congelado; mudar um plano não duplica o crédito de uma fatura
antiga. A política de upgrade no meio de um ciclo permanece pendente.

## Estratégia e WhatsApp

- Busca retorna sinais básicos, sem cobrar IA por empresa silenciosamente.
- Estratégia profunda só roda depois de um botão e confirmação de custo.
- Personalizar diagnóstico, oferta, argumentos, objeções e próxima mensagem
  para o serviço escolhido e fatos verificados daquele estabelecimento.
- Abrir WhatsApp não é enviar automaticamente e não gera nova cobrança.
- Link `wa.me` exige número normalizado e WhatsApp verificado. Sem verificação,
  não mostrar badge afirmativo nem direcionar para um telefone fictício.
- Texto de abordagem inicial pode usar o contexto básico; refinamento por IA
  segue a ação paga configurada. Nunca inventar nome do responsável.

## Sites profissionais - sequência planejada

1. Serviço elegível: sites, landing pages ou e-commerce.
2. Sem site próprio: proposta nova. Com site: analisar antes de sugerir redesign.
3. Análise server-side respeita robots, timeout, tamanho máximo, redirects e
   proteção SSRF/DNS rebinding; conteúdo externo é dado, nunca instrução.
4. Coletar evidências: mobile, navegação, HTTPS, clareza da oferta, velocidade,
   acessibilidade, agendamento/contato. Não concluir "desatualizado" por ausência
   de evidência ou só por julgamento genérico de IA.
5. Gerar brief específico ao nicho e aos dados confirmados do estabelecimento.
6. IA retorna schema validado de seções/design, não JavaScript/HTML arbitrário.
7. Renderer controlado produz site responsivo, acessível e com boa tipografia;
   evitar template idêntico para todas as empresas.
8. Preview sandbox, comparação com o atual, revisão do usuário e publicação
   versionada. Nunca alterar o site real da empresa sem autorização.
9. Refinamento por IA deve ter tarifa própria definida antes de habilitar.
   Edição manual de texto/cor sem provedor não dispara custo de IA escondido.

## Imagens para o estabelecimento

Design gráfico, branding, social media, tráfego, e-commerce e produção de conteúdo
podem oferecer conceitos visuais. Edição/gravação/fotografia recebem estratégias
específicas, não um gerador de site ou vídeo fictício.
Não tratar geração de imagem como substituto da fotografia real do produto.

Brief deve incluir empresa, serviço oferecido, formato, objetivo, identidade
autorizada e fatos disponíveis. Não copiar marcas concorrentes, gerar depoimentos
falsos ou apresentar imagem sintética como prova de produto/instalação real.
Mostrar como conceito/mockup, persistir por empresa e usuário, registrar custo
interno do provedor separadamente dos créditos comerciais.

## Próximos passos por fase

1. Conectar Auth/Turnstile e validar as migrations no Supabase local.
2. Implementar admin de regras/planos com as RPCs já auditadas.
3. Integrar pagamentos sandbox e concessão de franquia por webhook.
4. Integrar busca oficial e fila com reserva/estorno/reconciliação.
5. Habilitar estratégias e conversa após definir tarifas.
6. Conectar gerador de imagens e sites contextuais com preview/versionamento.
7. Implementar análise de site existente e refinamento assistido.

Nenhuma geração paga ou cobrança de cliente foi realizada para testar estas regras.
