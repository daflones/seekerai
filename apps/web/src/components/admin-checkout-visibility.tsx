"use client";

import { useState } from "react";
import { CheckCircle2, Eye, Loader2, Save } from "lucide-react";
import type { CreditPack } from "@/lib/i18n/shared";

// Toggle de visibilidade da vitrine do cliente (/app/planos):
// ligado = aparece pra compra; desligado = some da página (mas o
// histórico/assinatura existente continua funcionando).
export function AdminCheckoutVisibility({ plans, packs, hiddenPlans, hiddenPacks }: {
  plans: { slug: string; name: string }[];
  packs: CreditPack[];
  hiddenPlans: string[];
  hiddenPacks: string[];
}) {
  const [hiddenP, setHiddenP] = useState(() => new Set(hiddenPlans));
  const [hiddenK, setHiddenK] = useState(() => new Set(hiddenPacks));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));
  const dirty = !same(hiddenP, hiddenPlans) || !same(hiddenK, hiddenPacks);

  function toggle(set: Set<string>, id: string, apply: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    apply(next);
    setSaved("");
  }

  async function save() {
    setBusy(true);
    setError("");
    setSaved("");
    const res = await fetch("/api/admin/checkout-visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plans: [...hiddenP], packs: [...hiddenK] }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Não foi possível salvar."); return; }
    setSaved(data.message ?? "Salvo.");
  }

  const row = (key: string, label: string, off: boolean, onToggle: () => void) => (
    <div className={`cred-row${off ? " is-off" : ""}`} key={key}>
      <span className="cred-name"><strong>{label}</strong><small>{key}</small></span>
      <span className="cred-unit">{off ? "Oculto" : "Visível"}</span>
      <button type="button" role="switch" aria-checked={!off} aria-label={`Alternar ${label}`}
        className={`cred-switch${off ? "" : " on"}`} onClick={onToggle}><span /></button>
    </div>
  );

  return (
    <section className="cred-section" style={{ marginTop: 30 }}>
      <header className="cred-head">
        <h3><Eye size={15} /> Visibilidade em /app/planos</h3>
        <p>Itens desligados somem da página de planos do cliente (assinaturas e recargas). A landing não muda.</p>
      </header>
      <div className="cred-rows">
        {plans.map((p) => row(p.slug, `Plano ${p.name}`, hiddenP.has(p.slug),
          () => toggle(hiddenP, p.slug, setHiddenP)))}
        {packs.map((p) => row(p.id, `Pacote +${p.credits} créditos`, hiddenK.has(p.id),
          () => toggle(hiddenK, p.id, setHiddenK)))}
      </div>
      {error && <p role="alert" className="auth-error" style={{ marginTop: 10 }}>{error}</p>}
      {saved && <p role="status" className="editor-saved" style={{ marginTop: 10 }}><CheckCircle2 size={15} />{saved}</p>}
      {dirty && (
        <button type="button" className="cred-save" style={{ marginTop: 10 }} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
          {busy ? "Salvando…" : "Salvar visibilidade"}
        </button>
      )}
    </section>
  );
}
