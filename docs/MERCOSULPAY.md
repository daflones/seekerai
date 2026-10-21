# MercosulPay - integração pendente

Nenhum endpoint foi presumido ou implementado. Antes da fase 4, consultar
documentação oficial vigente e confirmar criação de cobrança PIX, consulta,
expiração, assinatura dos callbacks e ambiente sandbox.

O documento de origem contém chave LIVE. Ela não será usada para cobranças
de teste. Nenhuma chamada de criação de cobrança foi feita nesta entrega.

Não ativar planos por retorno de frontend. Implementar evento único por
provedor/ID, validação criptográfica conforme documentação oficial, transação
atômica de pagamento/assinatura/ledger e reconciliação. Se o provedor não
documentar assinatura, manter a integração desabilitada até estabelecer um
fluxo autenticado e verificável de confirmação.
