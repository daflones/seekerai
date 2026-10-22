"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { getMessages, type Messages } from "@/lib/i18n/messages";

type SupT = Messages["support"];

export function SupportForm({ t }: { t?: SupT }) {
  const tt = t ?? getMessages("pt").support;
  const [assunto, setAssunto] = useState("");
  const [categoria, setCategoria] = useState("tecnico");
  const [prioridade, setPrioridade] = useState("normal");
  const [mensagem, setMensagem] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

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
        setError(data?.error ?? tt.err);
        setBusy(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError(tt.errNet);
      setBusy(false);
    }
  }

  if (done) return <div className="ticket-done">
    <CheckCircle2 size={26} />
    <strong>{tt.doneT}</strong>
    <p>{tt.doneP}</p>
  </div>;

  return <form className="ticket-form" onSubmit={submit}>
    <label className="ticket-field ticket-field-full">
      <span>{tt.subject}</span>
      <input value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={140}
        placeholder={tt.subjectPh} required minLength={5} />
    </label>
    <div className="ticket-row">
      <label className="ticket-field">
        <span>{tt.category}</span>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {Object.entries(tt.cats).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <div className="ticket-field">
        <span>{tt.priority}</span>
        <div className="ticket-priorities" role="radiogroup" aria-label={tt.priority}>
          {Object.entries(tt.priorities).map(([v, l]) => (
            <button key={v} type="button" className={prioridade === v ? "selected" : ""} onClick={() => setPrioridade(v)}>{l}</button>
          ))}
        </div>
      </div>
    </div>
    <label className="ticket-field ticket-field-full">
      <span>{tt.message}</span>
      <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={5} maxLength={4000}
        placeholder={tt.messagePh} required minLength={10} />
      <small className="ticket-count">{mensagem.length}/4000</small>
    </label>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button type="submit" className="button button-primary" disabled={busy}>
      {busy ? <Loader2 size={16} className="spin" /> : <Send size={15} />}
      {busy ? tt.sending : tt.send}
    </button>
  </form>;
}
