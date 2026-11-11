"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Percent, Save } from "lucide-react";

// Desconto de upgrade por transição de plano ("de → para" → %).
// O desconto vale só pra quem já assina e está evoluindo — cobrado
// na primeira cobrança do novo plano (PIX já nasce descontado; no
// cartão entra como cupom de uso único, renovação a preço cheio).
export function AdminUpgradeDiscount({ plans, initial }: {
  plans: { slug: string; name: string; order: number }[];
  initial: Record<string, number>;
}) {
  const paid = plans.filter((p) => p.slug !== "gratis").sort((a, b) => a.order - b.order);
  const transitions: { from: string; to: string; key: string; label: string }[] = [];
  for (const f of paid) for (const t of paid) {
    if (t.order > f.order) transitions.push({ from: f.slug, to: t.slug, key: `${f.slug}:${t.slug}`, label: `${f.name} → ${t.name}` });
  }
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(transitions.map((t) => [t.key, String(initial[t.key] ?? 0)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const dirty = transitions.some((t) => values[t.key] !== String(initial[t.key] ?? 0));

  async function save() {
    setBusy(true);
    setError("");
    setSaved("");
    const discounts = Object.fromEntries(
      transitions.map((t) => [t.key, Math.min(90, Math.max(0, Math.trunc(Number(values[t.key]) || 0)))]),
    );
    const res = await fetch("/api/admin/upgrade-discount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discounts }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Não foi possível salvar."); return; }
    setSaved(data.message ?? "Salvo.");
    setValues(Object.fromEntries(transitions.map((t) => [t.key, String(discounts[t.key])])));
  }

  return (
    <section className="cred-section" style={{ marginTop: 30 }}>
      <header className="cred-head">
        <h3><Percent size={15} /> Desconto de upgrade</h3>
        <p>Percentual que o assinante ganha ao evoluir de plano — aparece no card (&ldquo;50% OFF&rdquo;) e já desconta na cobrança. 0 = sem desconto.</p>
      </header>
      <div className="cred-rows">
        {transitions.map((t) => (
          <div className="cred-row" key={t.key}>
            <span className="cred-name"><strong>{t.label}</strong><small>{t.key}</small></span>
            <span className="cred-unit upgrade-discount-input">
              <ArrowRight size={12} />
              <input type="number" min={0} max={90} step={1} inputMode="numeric"
                value={values[t.key]} onChange={(e) => { setValues((v) => ({ ...v, [t.key]: e.target.value })); setSaved(""); }}
                aria-label={`Desconto ${t.label}`} />
              <em>%</em>
            </span>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="auth-error" style={{ marginTop: 10 }}>{error}</p>}
      {saved && <p role="status" className="editor-saved" style={{ marginTop: 10 }}><CheckCircle2 size={15} />{saved}</p>}
      {dirty && (
        <button type="button" className="cred-save" style={{ marginTop: 10 }} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
          {busy ? "Salvando…" : "Salvar descontos"}
        </button>
      )}
    </section>
  );
}
