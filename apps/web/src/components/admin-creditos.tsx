"use client";

import { useState } from "react";
import { CheckCircle2, Coins, Save, Sparkles, Zap } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  search: "Busca",
  generate_site: "Criação de site",
  generate_image: "Criação de imagem",
  generate_app: "Criação de app",
  deep_strategy: "Estratégia aprofundada",
  sales_reply: "IA para conversas",
  whatsapp_check: "Verificação de WhatsApp",
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
  const [costs, setCosts] = useState<Record<string, number | null>>(
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

  return <form className="plan-editor editor-form" onSubmit={(e) => e.preventDefault()}>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {saved && <p role="status" className="editor-saved"><CheckCircle2 size={16} />{saved}</p>}

    <fieldset disabled={busy !== null}>
      <legend><Coins size={15} /> Créditos por plano (mensais)</legend>
      <p className="editor-hint">
        Cota liberada por mês de ciclo. Trimestral libera 3×, anual libera 12× de uma vez.
      </p>
      <div className="editor-features">
        {plans.map((p) => <div className="editor-feature" key={p.id}>
          <div>
            <strong>{p.nome}</strong>
            <small>plano {p.slug}</small>
          </div>
          <input
            type="number" min={0} max={1000000}
            value={planCredits[p.id] ?? p.creditos_mensais}
            onChange={(e) => setPlanCredits((c) => ({ ...c, [p.id]: Number(e.target.value) }))}
          />
          <button type="button" className="button button-primary" disabled={busy !== null}
            onClick={() => send({ acao: "plano-creditos", planId: p.id, creditos: planCredits[p.id] }, `plan-${p.id}`)}>
            <Save size={15} />{busy === `plan-${p.id}` ? "Salvando..." : "Salvar"}
          </button>
        </div>)}
      </div>
    </fieldset>

    <fieldset disabled={busy !== null}>
      <legend><Sparkles size={15} /> Bônus de cadastro</legend>
      <div className="editor-feature">
        <div>
          <strong>Créditos de boas-vindas</strong>
          <small>0 = conta nova começa zerada</small>
        </div>
        <input
          type="number" min={0} max={1000000}
          value={welcomeCredits}
          onChange={(e) => setWelcomeCredits(Number(e.target.value))}
        />
        <button type="button" className="button button-primary" disabled={busy !== null}
          onClick={() => send({ acao: "welcome-creditos", creditos: welcomeCredits }, "welcome")}>
          <Save size={15} />{busy === "welcome" ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </fieldset>

    <fieldset disabled={busy !== null}>
      <legend><Zap size={15} /> Custo por ação</legend>
      <p className="editor-hint">
        Créditos debitados por uso. Desmarcar desabilita a ação para todos os usuários.
      </p>
      <div className="editor-features">
        {rules.map((r) => <div className="editor-feature" key={r.action}>
          <div>
            <label>
              <input
                type="checkbox"
                checked={enabled[r.action] ?? r.enabled}
                onChange={(e) => setEnabled((c) => ({ ...c, [r.action]: e.target.checked }))}
              />
              <strong>{ACTION_LABELS[r.action] ?? r.action}</strong>
            </label>
            <small>{r.action}</small>
          </div>
          <input
            type="number" min={0} max={1000000}
            value={costs[r.action] ?? r.cost}
            onChange={(e) => setCosts((c) => ({ ...c, [r.action]: Number(e.target.value) }))}
          />
          <button type="button" className="button button-primary" disabled={busy !== null}
            onClick={() => send({
              acao: "custo-acao",
              action: r.action,
              cost: costs[r.action] ?? r.cost,
              enabled: enabled[r.action] ?? r.enabled,
            }, `rule-${r.action}`)}>
            <Save size={15} />{busy === `rule-${r.action}` ? "Salvando..." : "Salvar"}
          </button>
        </div>)}
      </div>
      <label className="editor-block-label">Motivo da alteração <small>(obrigatório, registrado na auditoria)</small>
        <textarea minLength={5} maxLength={300} rows={2} value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder="Ex.: reajuste de precificação" />
      </label>
    </fieldset>
  </form>;
}
