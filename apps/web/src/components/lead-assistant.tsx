"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { callAction, type LeadRow } from "@/lib/app-client";

interface Msg {
  autor: "user" | "ia";
  texto: string;
}

const SUGESTOES = [
  "Como abordo esse lead?",
  "Ele disse que já tem site — o que respondo?",
  "Escreve uma mensagem pra mandar agora",
  "Qual o próximo passo pra fechar?",
];

// Balão flutuante: assistente de conversação em tempo real dentro do lead.
export function LeadAssistant({ lead, serviceName }: { lead: LeadRow; serviceName: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function send(text?: string) {
    const pergunta = (text ?? input).trim();
    if (!pergunta || busy) return;
    setInput("");
    setError("");
    setBusy(true);
    setMsgs((m) => [...m, { autor: "user", texto: pergunta }]);
    const res = await callAction<{ conteudo?: string; creditosCobrados?: number }>(
      "ai-generate",
      {
        action: "lead_assist",
        serviceSlug: lead.service_slug,
        businessRef: lead.id,
        requestRef: crypto.randomUUID(),
        prompt: pergunta,
        context: {
          lead: {
            nome: lead.nome, categoria: lead.categoria, servico: serviceName,
            endereco: lead.endereco, cidade: lead.cidade, uf: lead.uf,
            telefone: lead.telefone, site: lead.site,
            avaliacao: lead.avaliacao, totalAvaliacoes: lead.total_avaliacoes,
            whatsapp: lead.whatsapp, instagram: lead.instagram,
            status: lead.status, notas: lead.notas,
          },
          historico: msgs.slice(-8),
        },
      },
    );
    setBusy(false);
    if (!res.ok || !res.data.conteudo) {
      setMsgs((m) => [...m, { autor: "ia", texto: res.ok ? "Não consegui responder agora." : `Erro: ${res.error}` }]);
      return;
    }
    setMsgs((m) => [...m, { autor: "ia", texto: res.data.conteudo! }]);
  }

  return <>
    <button type="button" className={`assist-fab${open ? " open" : ""}`}
      aria-label={open ? "Fechar assistente" : "Abrir assistente de conversão"}
      onClick={() => setOpen((o) => !o)}>
      {open ? <X size={20} /> : <Sparkles size={20} />}
      {!open && <span>Copiloto</span>}
    </button>

    {open && <aside className="assist-panel" aria-label="Assistente de conversão">
      <header className="assist-head">
        <Bot size={17} />
        <div>
          <strong>Copiloto de conversão</strong>
          <small>{lead.nome} · {lead.status}</small>
        </div>
      </header>

      <div className="assist-body">
        {msgs.length === 0 && <div className="assist-intro">
          <p>Eu conheço este lead — avaliações, contatos, sinais e o que já foi gerado. Pergunte qualquer coisa sobre como converter.</p>
          <div className="assist-sugestoes">
            {SUGESTOES.map((s) => (
              <button key={s} type="button" onClick={() => void send(s)}>{s}</button>
            ))}
          </div>
        </div>}
        {msgs.map((m, i) => (
          <div key={i} className={`assist-msg assist-${m.autor}`}>{m.texto}</div>
        ))}
        {busy && <div className="assist-msg assist-ia assist-typing"><Loader2 size={14} className="spin" /> pensando…</div>}
        <div ref={endRef} />
      </div>

      {error && <p className="assist-error" role="alert">{error}</p>}
      <form className="assist-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte sobre este lead…"
          maxLength={600}
          disabled={busy}
        />
        <button type="submit" className="assist-send" disabled={busy || !input.trim()} aria-label="Enviar">
          {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        </button>
      </form>
    </aside>}
  </>;
}
