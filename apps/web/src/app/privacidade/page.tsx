import type { Metadata } from "next";
import { InnerHeader } from "@/components/inner-header";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return <div className="inner-page"><InnerHeader /><main id="conteudo" className="container legal-content">
    <span className="eyebrow">SEUS DADOS IMPORTAM</span><h1>Política de Privacidade</h1>
    <p className="legal-intro">Versão inicial · 21 de outubro de 2026. O produto está em desenvolvimento. A abertura pública depende de revisão jurídica, identificação do controlador, canal de privacidade e definição dos prazos de retenção. O acesso inicial é destinado à validação técnica.</p>
    <h2>1. Dados de conta e finalidade</h2><p>Quando a autenticação estiver habilitada, solicitamos nome, telefone, e-mail e senha para criar e proteger sua conta. O Supabase trata a autenticação; a aplicação não grava senhas em tabelas de perfil ou logs. O perfil registra o aceite dos termos, sua versão e a data. Comunicações opcionais têm escolha separada e desmarcada por padrão.</p>
    <h2>2. Sessão e proteção contra abuso</h2><p>Cookies necessários mantêm a sessão e são configurados como HttpOnly, SameSite=Lax e Secure em produção. O Cloudflare Turnstile processa sinais técnicos para prevenir abuso. Limites de tentativas usam identificadores derivados por HMAC, sem armazenar e-mail ou IP em texto aberto na tabela de limites.</p>
    <h2>3. Demonstração e área de transferência</h2><p>Os negócios da demonstração são fictícios. Suas seleções e favoritos demonstrativos ficam na memória da página. O botão de copiar escreve na área de transferência somente após sua ação; não lê seu conteúdo e não envia mensagens a terceiros.</p>
    <h2>4. Fornecedores e comunicação</h2><p>Supabase e Cloudflare participam dos fluxos de conta e segurança, conforme suas políticas e infraestrutura. Confirmação de e-mail e recuperação de senha são comunicações necessárias ao acesso. Não há publicidade comportamental ou pixels de anúncios habilitados nesta versão. A hospedagem pode manter registros técnicos conforme sua configuração.</p>
    <h2>5. Direitos e condições de lançamento</h2><p>Os fluxos automatizados de exportação e exclusão de conta, o canal verificável de atendimento, as bases legais detalhadas, a retenção e as informações de transferência internacional precisam ser concluídos antes da abertura comercial. Não use esta fase de validação para cadastrar dados de terceiros ou dados sensíveis.</p>
  </main></div>;
}
