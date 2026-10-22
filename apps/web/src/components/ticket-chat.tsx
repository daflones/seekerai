"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Lock, Send } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { dateTag, type Lang } from "@/lib/i18n/shared";

export interface ChatMessage {
  id: string;
  sender_role: "user" | "admin";
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
}: {
  ticketId: string;
  status: string;
  onStatus?: (status: string) => void;
  t?: Messages["support"];
  lang?: Lang;
}) {
  const tt = t ?? getMessages("pt").support;
  const tag = dateTag(lang);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
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

  const open = ticketOpen(currentStatus);

  return <div className="chat">
    <div className="chat-messages" ref={boxRef}>
      {loading && <p className="chat-loading"><Loader2 size={16} className="spin" /> {tt.loading}</p>}
      {!loading && messages.length === 0 && <p className="chat-loading">{tt.noMsgs}</p>}
      {messages.map((m) => (
        <div key={m.id} className={`chat-msg ${m.sender_role === "admin" ? "chat-msg-admin" : "chat-msg-user"}`}>
          <span className="chat-msg-from">{m.sender_role === "admin" ? "SeekerAi" : tt.you}</span>
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
        <button type="button" onClick={() => void send()} disabled={busy || !text.trim()}>
          {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />} {tt.sendBtn}
        </button>
      </div>
    ) : (
      <p className="chat-closed"><Lock size={14} /> {(tt.status as Record<string, string>)[currentStatus] ?? currentStatus} — {tt.closed}</p>
    )}
    {error && <p className="form-error">{error}</p>}
  </div>;
}
