import type { Metadata } from "next";
import Link from "next/link";
import { InnerHeader } from "@/components/inner-header";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return <div className="inner-page"><InnerHeader /><main id="conteudo" className="container legal-content">
    <span className="eyebrow">TRANSPARÊNCIA DESDE O INÍCIO</span><h1>Termos de Uso</h1>
    <p className="legal-intro">Versão inicial · 21 de outubro de 2026. Acesso para validação de um produto em desenvolvimento. Revisão jurídica e identificação do responsável legal permanecem requisitos para o lançamento comercial.</p>
    <h2>1. Conta e segurança</h2><p>Quando o acesso estiver habilitado, use dados próprios, confirme seu e-mail e mantenha sua senha em sigilo. O captcha é obrigatório para login, cadastro e recuperação. A criação da conta não concede acesso administrativo: essa permissão é atribuída e verificada no servidor.</p>
    <h2>2. O que está disponível</h2><p>A demonstração de prospecção faz buscas reais limitadas a 3 por visitante, exibindo dados públicos de estabelecimentos com contatos mascarados; ela não gera sites, imagens ou estratégias. As mensagens de exemplo são ilustrativas. Sites, imagens, IA de vendas, chamadas e portfólios apresentados como prévias não devem ser interpretados como garantia de resultado. A conta autenticada permite conhecer seu espaço e as configurações disponíveis.</p>
    <h2>3. Sem contratação automática</h2><p>Não há processamento de pagamentos ou envio automático de mensagens nesta versão. Selecionar um plano não inicia assinatura nem cobrança. Recursos pagos só poderão ser executados quando habilitados, com suas condições apresentadas antes da confirmação.</p>
    <h2>4. Uso responsável e limites</h2><p>Não use o produto para contatos abusivos nem para tratar dados de estabelecimentos além da finalidade de prospecção legítima. Respeite a LGPD, os direitos sobre imagens e as políticas dos canais. Não garantimos clientes, respostas, vendas ou faturamento.</p>
    <h2>5. Privacidade e próximas versões</h2><p>O tratamento de dados está descrito na <Link href="/privacidade">Política de Privacidade</Link>. O lançamento comercial depende de canais de suporte, regras comerciais definitivas, mecanismos de exercício de direitos e validação das integrações.</p>
  </main></div>;
}
