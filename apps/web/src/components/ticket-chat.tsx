"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Lock, Paperclip, Reply, Send, Sparkles, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { callAction } from "@/lib/app-client";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { dateTag, type Lang } from "@/lib/i18n/shared";

export interface ChatAnexo {
  path: string;
  nome: string;
  tipo: string;
  tamanho?: number;
}

export interface ChatMessage {
  id: string;
  sender_role: "user" | "admin" | "ia";
  mensagem: string;
  anexos?: ChatAnexo[] | null;
  reply_to?: string | null;
  created_at: string;
}

function fileUrl(path: string): string {
  return `/api/tickets/file?p=${encodeURIComponent(path)}`;
}

const ATTACH_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

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
  const [anexos, setAnexos] = useState<ChatAnexo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const seen = useRef(new Set<string>());
  const boxRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  async function attach(files: FileList | null) {
    if (!files || uploading) return;
    setUploading(true);
    setError("");
    for (const file of Array.from(files).slice(0, 4 - anexos.length)) {
      if (file.size > 8 * 1024 * 1024 || !ATTACH_ACCEPT.split(",").includes(file.type)) {
        setError(tt.attachType ?? "Só imagens ou PDF, até 8 MB.");
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/tickets/${ticketId}/upload`, { method: "POST", body: form })
        .catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !data?.anexo) {
        setError(data?.error ?? tt.attachFail ?? "Não foi possível anexar.");
        continue;
      }
      setAnexos((list) => [...list, data.anexo as ChatAnexo]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    const mensagem = text.trim();
    if ((!mensagem && anexos.length === 0) || busy || uploading) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem, reply_to: replyTo?.id ?? null, anexos }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok || !data?.mensagem) {
      setError(data?.error ?? tt.errSend);
      return;
    }
    setText("");
    setAnexos([]);
    setReplyTo(null);
    merge([data.mensagem as ChatMessage]);
  }

  // Aprimora o rascunho — ou, sem rascunho e com mensagem marcada, gera
  // a resposta do zero ("marcar a mensagem e gerar resposta").
  async function enhance(markedMsg?: ChatMessage) {
    const marked = markedMsg ?? replyTo;
    const draft = text.trim();
    if ((!draft && !marked) || enhancing || busy) return;
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
        marcada: marked ? `[${marked.sender_role}] ${marked.mensagem.slice(0, 1200)}` : null,
        mensagens: messages.slice(-8).map((m) =>
          `[${m.sender_role}] ${m.mensagem}` +
          (m.anexos?.length ? ` [anexou: ${m.anexos.map((a) => a.nome).join(", ")}]` : "")),
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
      {messages.map((m) => {
        const quoted = m.reply_to ? messages.find((x) => x.id === m.reply_to) : null;
        return (
        <div key={m.id} className={`chat-msg ${m.sender_role === "user" ? "chat-msg-user" : "chat-msg-admin"}`}>
          {open && (
            <span className="chat-msg-actions">
              <button type="button" title={tt.replyBtn ?? "Responder"} onClick={() => setReplyTo(m)}>
                <Reply size={13} />
              </button>
              {enhanceable && m.sender_role === "user" && (
                <button type="button" title="Gerar resposta com IA pra esta mensagem"
                  disabled={enhancing || busy}
                  onClick={() => { setReplyTo(m); void enhance(m); }}>
                  {enhancing ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                </button>
              )}
            </span>
          )}
          <span className="chat-msg-from">
            {m.sender_role === "user" ? tt.you : "SeekerAi"}
            {m.sender_role === "ia" && <em className="chat-ia-seal">IA</em>}
          </span>
          {quoted && (
            <span className="chat-quote">
              <b>{quoted.sender_role === "user" ? tt.you : "SeekerAi"}</b>
              {quoted.mensagem.slice(0, 140) || "…"}
            </span>
          )}
          {m.mensagem && <p>{m.mensagem}</p>}
          {m.anexos?.map((a) => a.tipo === "application/pdf" ? (
            <a key={a.path} className="chat-att-file" href={fileUrl(a.path)} target="_blank" rel="noopener">
              <FileText size={15} /> {a.nome}
            </a>
          ) : (
            <a key={a.path} className="chat-att-img" href={fileUrl(a.path)} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(a.path)} alt={a.nome} loading="lazy" />
            </a>
          ))}
          <small>{new Date(m.created_at).toLocaleString(tag, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
        </div>
        );
      })}
    </div>
    {open ? (
      <div className="chat-composer">
        {replyTo && (
          <div className="chat-replying">
            <span>
              <b>{replyTo.sender_role === "user" ? tt.you : "SeekerAi"}</b>
              {replyTo.mensagem.slice(0, 120) || "…"}
            </span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar"><X size={13} /></button>
          </div>
        )}
        {anexos.length > 0 && (
          <div className="chat-attach-list">
            {anexos.map((a) => (
              <span key={a.path} className="chat-att-chip">
                {a.tipo === "application/pdf" ? <FileText size={13} /> : <Paperclip size={13} />}
                {a.nome}
                <button type="button" onClick={() => setAnexos((l) => l.filter((x) => x.path !== a.path))} aria-label="Remover"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="chat-composer-row">
          <input
            ref={fileRef}
            type="file"
            accept={ATTACH_ACCEPT}
            multiple
            hidden
            onChange={(e) => void attach(e.target.files)}
          />
          <button
            type="button"
            className="chat-attach"
            onClick={() => fileRef.current?.click()}
            disabled={busy || uploading || anexos.length >= 4}
            title={tt.attach ?? "Anexar imagem ou PDF"}
          >
            {uploading ? <Loader2 size={16} className="spin" /> : <Paperclip size={16} />}
          </button>
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
              disabled={enhancing || busy || (!text.trim() && !replyTo)}
              title={replyTo && !text.trim() ? "Gerar resposta com IA" : "Aprimorar com IA"}
            >
              {enhancing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            </button>
          )}
          <button type="button" className="button button-primary chat-send" onClick={() => void send()} disabled={busy || enhancing || uploading || (!text.trim() && anexos.length === 0)}>
            {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />} {tt.sendBtn}
          </button>
        </div>
      </div>
    ) : (
      <p className="chat-closed"><Lock size={14} /> {(tt.status as Record<string, string>)[currentStatus] ?? currentStatus} — {tt.closed}</p>
    )}
    {error && <p className="form-error">{error}</p>}
  </div>;
}
