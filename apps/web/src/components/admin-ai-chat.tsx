"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, User, Wrench, AlertTriangle } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  trace?: { tool: string; resumo: string; erro?: boolean }[];
}

const STORE_KEY = "seekerai_admin_ai_v1";
const SUGGESTIONS = [
  "Como está o faturamento dos últimos 30 dias?",
  "Quem vai renovar a assinatura nos próximos 7 dias?",
  "Saldos dos provedores de IA",
  "Quantos usuários novos entraram essa semana?",
];

const TOOL_LABELS: Record<string, string> = {
  report_payments: "Relatório de pagamentos",
  report_subscriptions: "Assinaturas e MRR",
  report_users: "Usuários",
  report_usage: "Uso da plataforma",
  report_forecast: "Previsão de renovações",
  report_tickets: "Chamados",
  find_user: "Busca de usuário",
  customer_summary: "Resumo do cliente",
  provider_credits: "Créditos dos provedores",
  list_plans: "Planos",
  adjust_credits: "Ajuste de créditos",
  set_user_plan: "Troca de plano",
  cancel_subscription: "Cancelamento",
  set_plan_flags: "Flags do plano",
  notify_users: "Notificação",
};

export function AdminAiChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null") as Msg[] | null;
      if (Array.isArray(saved)) setMessages(saved.slice(-40));
    } catch { /* ignora */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-40))); } catch { /* ignora */ }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    setError("");
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        { reply?: string; trace?: Msg["trace"]; error?: string } | null;
      if (!res.ok || !data?.reply) {
        setError(data?.error ?? "O agente não respondeu. Tente de novo.");
        setMessages((cur) => cur.slice(0, -1));
        return;
      }
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply!, trace: data.trace }]);
    } catch {
      setError("Falha de conexão com o agente.");
      setMessages((cur) => cur.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat-log">
        {!messages.length && (
          <div className="ai-chat-empty">
            <Bot size={28} />
            <p>Pergunte qualquer coisa sobre o negócio — pagamentos, usuários, previsões, saldos dos provedores. Eu também executo ações: ajustar créditos, trocar planos, notificar usuários.</p>
            <div className="ai-chat-sugs">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <span className="ai-msg-ico">{m.role === "user" ? <User size={14} /> : <Bot size={14} />}</span>
            <div className="ai-msg-body">
              {m.trace && m.trace.length > 0 && (
                <div className="ai-trace">
                  {m.trace.map((t, j) => (
                    <span key={j} className={`ai-trace-item${t.erro ? " ai-trace-err" : ""}`}>
                      <Wrench size={11} />
                      {TOOL_LABELS[t.tool] ?? t.tool}
                      {t.resumo ? ` · ${t.resumo}` : ""}
                    </span>
                  ))}
                </div>
              )}
              <div className="ai-msg-text">{m.content}</div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="ai-msg ai-msg-assistant">
            <span className="ai-msg-ico"><Bot size={14} /></span>
            <div className="ai-msg-body"><div className="ai-msg-text ai-typing">…</div></div>
          </div>
        )}
        {error && (
          <div className="ai-error"><AlertTriangle size={14} /> {error}</div>
        )}
        <div ref={bottomRef} />
      </div>
      <form
        className="ai-chat-form"
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex.: quanto faturei esse mês? ou: dê 50 créditos pro joao@teste.com"
          maxLength={4000}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
