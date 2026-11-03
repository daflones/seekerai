"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Package, Save } from "lucide-react";
import type { CreditPack } from "@/lib/i18n/shared";

const toReais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const toCents = (v: string) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100) || 0;

export function AdminPacks({ initial }: { initial: CreditPack[] }) {
  const [packs, setPacks] = useState<CreditPack[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const dirty = JSON.stringify(packs) !== JSON.stringify(initial);

  const set = (id: string, field: "credits" | "brlCents" | "intlCents", v: number) =>
    setPacks((ps) => ps.map((p) => (p.id === id ? { ...p, [field]: v } : p)));

  async function save() {
    setBusy(true);
    setError("");
    setSaved("");
    const res = await fetch("/api/admin/packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packs }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Não foi possível salvar."); return; }
    setSaved(data.message ?? "Salvo.");
  }

  return (
    <section className="cred-section">
      <header className="cred-head">
        <h3><Package size={15} /> Pacotes de créditos à venda</h3>
        <p>O que o assinante compra de avulso em /app/planos. Preços em reais (BR) e dólar/euro (internacional).</p>
      </header>
      <div className="cred-rows">
        {packs.map((p) => (
          <div className="cred-row" key={p.id}>
            <span className="cred-name"><strong>+{p.credits} créditos</strong><small>{p.id}</small></span>
            <label className="pack-field">
              <small>Qtd. créditos</small>
              <input className="cred-num" type="number" min={1} max={100000} value={p.credits}
                onChange={(e) => set(p.id, "credits", Math.max(1, Math.trunc(Number(e.target.value) || 0)))} />
            </label>
            <label className="pack-field">
              <small>Preço R$</small>
              <input className="cred-num" inputMode="decimal" defaultValue={toReais(p.brlCents)} key={`brl-${p.id}-${p.brlCents}`}
                onBlur={(e) => set(p.id, "brlCents", Math.max(100, toCents(e.target.value)))} />
            </label>
            <label className="pack-field">
              <small>Preço $ / €</small>
              <input className="cred-num" inputMode="decimal" defaultValue={toReais(p.intlCents)} key={`intl-${p.id}-${p.intlCents}`}
                onBlur={(e) => set(p.id, "intlCents", Math.max(50, toCents(e.target.value)))} />
            </label>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="auth-error" style={{ marginTop: 10 }}>{error}</p>}
      {saved && <p role="status" className="editor-saved" style={{ marginTop: 10 }}><CheckCircle2 size={15} />{saved}</p>}
      {dirty && (
        <button type="button" className="cred-save" style={{ marginTop: 10 }} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
          {busy ? "Salvando…" : "Salvar pacotes"}
        </button>
      )}
    </section>
  );
}
