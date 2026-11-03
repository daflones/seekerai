"use client";

import { useState } from "react";
import { CheckCircle2, Coins, Loader2, Save, Sparkles, Zap } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  search: "Busca",
  generate_site: "Criação de site",
  generate_image: "Criação de imagem",
  generate_app: "Criação de app",
  deep_strategy: "Estratégia aprofundada",
  sales_reply: "IA para conversas",
  whatsapp_check: "Verificação de WhatsApp",
  image_prompt: "Prompt de imagem",
  lead_assist: "Copiloto de conversão",
};

interface PlanRow { id: string; slug: string; nome: string; creditos_mensais: number }
interface RuleRow { action: string; cost: number; enabled: boolean }

export function AdminCreditos({ plans, rules, welcome }: {
  plans: PlanRow[];
  rules: RuleRow[];
  welcome: number;
}) {
  const [planCredits, setPlanCredits] = useState<Record<string, number>>(
    Object.fromEntries(plans.map((p) => [p.id, p.creditos_mensais])));
  const [welcomeCredits, setWelcomeCredits] = useState(welcome);
  const [costs, setCosts] = useState<Record<string, number>>(
    Object.fromEntries(rules.map((r) => [r.action, r.cost])));
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(rules.map((r) => [r.action, r.enabled])));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function send(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    setSaved("");
    const res = await fetch("/api/admin/creditos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, motivo: reason.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error || "Não foi possível salvar."); return; }
    setSaved(data.message || "Salvo.");
  }

  function Num({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
      <input className="cred-num" type="number" min={0} max={1000000} value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
    );
  }

  function SaveBtn({ show, k, onClick }: { show: boolean; k: string; onClick: () => void }) {
    if (!show) return null;
    return (
      <button type="button" className="cred-save" disabled={busy !== null} onClick={onClick}>
        {busy === k ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
        {busy === k ? "…" : "Salvar"}
      </button>
    );
  }

  return <form className="cred-editor" onSubmit={(e) => e.preventDefault()}>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {saved && <p role="status" className="editor-saved"><CheckCircle2 size={16} />{saved}</p>}

    <section className="cred-section">
      <header className="cred-head">
        <h3><Coins size={15} /> Créditos por plano <small>mensais</small></h3>
        <p>Cota liberada por mês de ciclo. Trimestral libera 3×, anual 12× de uma vez.</p>
      </header>
      <div className="cred-rows">
        {plans.map((p) => {
          const v = planCredits[p.id] ?? p.creditos_mensais;
          const dirty = v !== p.creditos_mensais;
          return (
            <div className={`cred-row${dirty ? " is-dirty" : ""}`} key={p.id}>
              <span className="cred-name"><strong>{p.nome}</strong><small>{p.slug}</small></span>
              <span className="cred-unit">cr/mês</span>
              <Num value={v} onChange={(n) => setPlanCredits((c) => ({ ...c, [p.id]: n }))} />
              <SaveBtn show={dirty} k={`plan-${p.id}`}
                onClick={() => send({ acao: "plano-creditos", planId: p.id, creditos: v }, `plan-${p.id}`)} />
            </div>
          );
        })}
      </div>
    </section>

    <section className="cred-section">
      <header className="cred-head">
        <h3><Sparkles size={15} /> Bônus de cadastro</h3>
        <p>0 = conta nova começa zerada.</p>
      </header>
      <div className="cred-rows">
        <div className={`cred-row${welcomeCredits !== welcome ? " is-dirty" : ""}`}>
          <span className="cred-name"><strong>Créditos de boas-vindas</strong><small>welcome_credits</small></span>
          <span className="cred-unit">cr</span>
          <Num value={welcomeCredits} onChange={setWelcomeCredits} />
          <SaveBtn show={welcomeCredits !== welcome} k="welcome"
            onClick={() => send({ acao: "welcome-creditos", creditos: welcomeCredits }, "welcome")} />
        </div>
      </div>
    </section>

    <section className="cred-section">
      <header className="cred-head">
        <h3><Zap size={15} /> Custo por ação</h3>
        <p>Créditos debitados por uso. Desligar desabilita a ação para todos.</p>
      </header>
      <div className="cred-rows">
        {rules.map((r) => {
          const cost = costs[r.action] ?? r.cost;
          const on = enabled[r.action] ?? r.enabled;
          const dirty = cost !== r.cost || on !== r.enabled;
          return (
            <div className={`cred-row${dirty ? " is-dirty" : ""}${on ? "" : " is-off"}`} key={r.action}>
              <button type="button" role="switch" aria-checked={on}
                className={`cred-switch${on ? " on" : ""}`}
                onClick={() => setEnabled((c) => ({ ...c, [r.action]: !on }))}>
                <span />
              </button>
              <span className="cred-name"><strong>{ACTION_LABELS[r.action] ?? r.action}</strong><small>{r.action}</small></span>
              <span className="cred-unit">cr/uso</span>
              <Num value={cost} onChange={(n) => setCosts((c) => ({ ...c, [r.action]: n }))} />
              <SaveBtn show={dirty} k={`rule-${r.action}`}
                onClick={() => send({ acao: "custo-acao", action: r.action, cost, enabled: on }, `rule-${r.action}`)} />
            </div>
          );
        })}
      </div>
      <label className="cred-reason">
        Motivo da alteração <em>(obrigatório, registrado na auditoria)</em>
        <textarea minLength={5} maxLength={300} rows={2} value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder="Ex.: reajuste de precificação" />
      </label>
    </section>
  </form>;
}
