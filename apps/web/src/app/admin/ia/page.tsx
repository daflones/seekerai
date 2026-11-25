import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { AdminAiChat } from "@/components/admin-ai-chat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agente IA", robots: { index: false, follow: false } };

export default function AdminAiPage() {
  return (
    <div className="ai-page">
      <header className="ai-page-head">
        <h1><Bot size={22} /> Agente IA</h1>
        <p>
          Console de comando do SeekerAi — relatórios de pagamentos, usuários, previsões e
          saldos em tempo real, além de ações diretas: créditos, planos, cancelamentos e
          notificações. Toda ação fica registrada no audit log.
        </p>
      </header>
      <AdminAiChat />
    </div>
  );
}
