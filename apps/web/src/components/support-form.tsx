"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

const CATEGORIAS = [
  ["tecnico", "Problema técnico"],
  ["cobranca", "Cobrança e pagamento"],
  ["creditos", "Créditos e plano"],
  ["sugestao", "Sugestão"],
  ["outro", "Outro assunto"],
];

const PRIORIDADES = [
  ["baixa", "Baixa"],
  ["normal", "Normal"],
  ["alta", "Alta"],
];

export function SupportForm() {
  const [assunto, setAssunto] = useState("");
  const [categoria, setCategoria] = useState("tecnico");
  const [prioridade, setPrioridade] = useState("normal");
  const [mensagem, setMensagem] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assunto, categoria, prioridade, mensagem }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Não foi possível abrir o chamado.");
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Sem conexão. Tente novamente.");
      setBusy(false);
    }
  }

  if (done) return <div className="ticket-done">
    <CheckCircle2 size={26} />
    <strong>Chamado aberto.</strong>
    <p>Nossa equipe recebeu sua mensagem e responde por e-mail. Ele aparece na lista abaixo após recarregar.</p>
  </div>;

  return <form className="ticket-form" onSubmit={submit}>
    <label className="ticket-field ticket-field-full">
      <span>Assunto</span>
      <input value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={140}
        placeholder="Resuma sua dúvida ou problema" required minLength={5} />
    </label>
    <div className="ticket-row">
      <label className="ticket-field">
        <span>Categoria</span>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {CATEGORIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <div className="ticket-field">
        <span>Prioridade</span>
        <div className="ticket-priorities" role="radiogroup" aria-label="Prioridade">
          {PRIORIDADES.map(([v, l]) => (
            <button key={v} type="button" className={prioridade === v ? "selected" : ""} onClick={() => setPrioridade(v)}>{l}</button>
          ))}
        </div>
      </div>
    </div>
    <label className="ticket-field ticket-field-full">
      <span>Mensagem</span>
      <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={5} maxLength={4000}
        placeholder="Explique o que aconteceu com o máximo de detalhes possível…" required minLength={10} />
      <small className="ticket-count">{mensagem.length}/4000</small>
    </label>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button type="submit" className="button button-primary" disabled={busy}>
      {busy ? <Loader2 size={16} className="spin" /> : <Send size={15} />}
      {busy ? "Enviando…" : "Enviar chamado"}
    </button>
  </form>;
}
