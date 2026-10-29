"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Percent, Save, Tag } from "lucide-react";

export function AdminDiscount({ initialPct }: { initialPct: number }) {
  const [on, setOn] = useState(initialPct > 0);
  const [pct, setPct] = useState(initialPct > 0 ? initialPct : 20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    const res = await fetch("/api/admin/desconto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pct: on ? pct : 0 }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) { setError(body?.error ?? "Não foi possível salvar."); return; }
    setNotice(body?.message ?? "Salvo.");
  }

  return (
    <section className="dash-panel">
      <h2><Tag size={16} /> Desconto de primeira compra</h2>
      <p className="dash-hint">
        Vale só no plano de quem nunca pagou — o card mostra o preço cheio riscado
        e o desconto aparece no PIX e no cartão. Na renovação o Stripe cobra o valor normal.
      </p>
      <div className="editor-fields">
        <div className="editor-checks">
          <label>
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
            Desconto ativo nos cards de plano
          </label>
        </div>
        {on && (
          <label className="editor-block-label">Percentual (%)
            <input inputMode="numeric" value={pct} min={1} max={90}
              onChange={(e) => setPct(Math.min(90, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))} />
          </label>
        )}
        <button type="button" className="button button-primary" disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
          {busy ? "Salvando…" : `Salvar${on ? ` -${pct}%` : " desligado"}`}
        </button>
      </div>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {notice && <p role="status" className="editor-saved"><CheckCircle2 size={15} />{notice}</p>}
      <p className="dash-hint"><Percent size={12} /> Status: {on ? `${pct}% OFF na primeira compra` : "desligado"}</p>
    </section>
  );
}
