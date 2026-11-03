"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Send, Sparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { callAction } from "@/lib/app-client";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { dateTag, type Lang } from "@/lib/i18n/shared";

export interface ChatMessage {
  id: string;
  sender_role: "user" | "admin" | "ia";
  mensagem: string;
  created_at: string;
}

const OPEN = new Set(["aberto", "em_andamento", "pendente"]);

export const TICKET_STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  pendente: "Pendente",
  resolvido: "Resolvido",
  cancelado: "Cancelado",
  expirado: "Expirado",
};

export function ticketOpen(status: string) {
  return OPEN.has(status);
}

// Chat do chamado: realtime via Supabase + polling de segurança a cada 6s.
export function TicketChat({
  ticketId,
  status,
  onStatus,
  t,
  lang = "pt",
  enhanceable = false,
  chatContext,
}: {
  ticketId: string;
  status: string;
  onStatus?: (status: string) => void;
  t?: Messages["support"];
  lang?: Lang;
  /** Só no painel admin: botão "aprimorar com IA" no composer. */
  enhanceable?: boolean;
  chatContext?: { assunto?: string; cliente?: string };
}) {
  const tt = t ?? getMessages("pt").support;
  const tag = dateTag(lang);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const seen = useRef(new Set<string>());
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setCurrentStatus(status); }, [status]);

  const merge = useCallback((incoming: ChatMessage[]) => {
    const fresh = incoming.filter((m) => !seen.current.has(m.id));
    if (fresh.length) {
      fresh.forEach((m) => seen.current.add(m.id));
      setMessages((list) => [...list, ...fresh]);
    }
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    if (data?.mensagens) {
      merge(data.mensagens as ChatMessage[]);
      if (data.ticket?.status && data.ticket.status !== currentStatus) {
        setCurrentStatus(data.ticket.status);
        onStatus?.(data.ticket.status);
      }
    }
    setLoading(false);
  }, [ticketId, merge, currentStatus, onStatus]);

  useEffect(() => {
    seen.current = new Set();
    setMessages([]);
    setLoading(true);
    void load();
    const poll = setInterval(() => void load(), 6000);

    const sb = supabaseBrowser();
    const channel = sb?.channel(`ticket-${ticketId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => merge([payload.new as ChatMessage]))
      .subscribe();
    return () => {
      clearInterval(poll);
      if (channel) void sb?.removeChannel(channel);
    };
  }, [ticketId, load, merge]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const mensagem = text.trim();
    if (!mensagem || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok || !data?.mensagem) {
      setError(data?.error ?? tt.errSend);
      return;
    }
    setText("");
    merge([data.mensagem as ChatMessage]);
  }

  async function enhance() {
    const draft = text.trim();
    if (!draft || enhancing || busy) return;
    setEnhancing(true);
    setError("");
    const res = await callAction<{ conteudo?: string }>("ai-generate", {
      action: "enhance_reply",
      serviceSlug: "_admin",
      businessRef: `ticket:${ticketId}`,
      requestRef: crypto.randomUUID(),
      prompt: draft.slice(0, 4000),
      context: {
        assunto: chatContext?.assunto ?? null,
        cliente: chatContext?.cliente ?? null,
        mensagens: messages.slice(-8).map((m) => `[${m.sender_role}] ${m.mensagem}`),
      },
    }).catch(() => null);
    setEnhancing(false);
    const improved = res?.ok ? res.data?.conteudo?.trim() : "";
    if (!improved) {
      setError((!res?.ok && res?.error) || "Não foi possível aprimorar agora. Tenta de novo.");
      return;
    }
    setText(improved);
  }

  const open = ticketOpen(currentStatus);

  return <div className="chat">
    <div className="chat-messages" ref={boxRef}>
      {loading && <p className="chat-loading"><Loader2 size={16} className="spin" /> {tt.loading}</p>}
      {!loading && messages.length === 0 && <p className="chat-loading">{tt.noMsgs}</p>}
      {messages.map((m) => (
        <div key={m.id} className={`chat-msg ${m.sender_role === "user" ? "chat-msg-user" : "chat-msg-admin"}`}>
          <span className="chat-msg-from">
            {m.sender_role === "user" ? tt.you : "SeekerAi"}
            {m.sender_role === "ia" && <em className="chat-ia-seal">IA</em>}
          </span>
          <p>{m.mensagem}</p>
          <small>{new Date(m.created_at).toLocaleString(tag, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
        </div>
      ))}
    </div>
    {open ? (
      <div className="chat-composer">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 4000))}
          placeholder={tt.write}
          rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        {enhanceable && (
          <button
            type="button"
            className="chat-enhance"
            onClick={() => void enhance()}
            disabled={enhancing || busy || !text.trim()}
            title="Aprimorar com IA"
          >
            {enhancing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          </button>
        )}
        <button type="button" onClick={() => void send()} disabled={busy || enhancing || !text.trim()}>
          {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />} {tt.sendBtn}
        </button>
      </div>
    ) : (
      <p className="chat-closed"><Lock size={14} /> {(tt.status as Record<string, string>)[currentStatus] ?? currentStatus} — {tt.closed}</p>
    )}
    {error && <p className="form-error">{error}</p>}
  </div>;
}
