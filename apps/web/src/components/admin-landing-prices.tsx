"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Save, Tag } from "lucide-react";

// Liga/desliga os preços da landing page (cards, "a partir de" do hero,
// CTA final e JSON-LD). Dentro do app o preço continua sempre visível.
export function AdminLandingPrices({ initial }: { initial: boolean }) {
  const [show, setShow] = useState(initial);
  const [persisted, setPersisted] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const res = await fetch("/api/admin/landing-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Não foi possível salvar."); return; }
      setPersisted(show);
      setSaved("A landing já reflete a mudança.");
    } catch { setError("Falha de conexão. Tente salvar novamente."); }
    finally { setBusy(false); }
  }

  return (
    <section className="cred-section" style={{ marginTop: 30 }}>
      <header className="cred-head">
        <h3><Tag size={15} /> Preços na landing</h3>
        <p>
          Ligado: cards de plano com valores, &ldquo;a partir de R$ X/mês&rdquo; no hero e preços no CTA final.
          Desligado: a seção #planos vira só CTA pro cadastro — o preço aparece apenas dentro do app.
        </p>
      </header>
      <div className={`cred-row${show ? "" : " is-off"}`}>
        <span className="cred-name"><strong>Exibir preços na landing</strong><small>landing_show_prices</small></span>
        <span className="cred-unit">{show ? "Ativado" : "Desativado"}</span>
        <button type="button" role="switch" aria-checked={show} aria-label="Alternar preços na landing"
          className={`cred-switch${show ? " on" : ""}`} disabled={busy} onClick={() => { setShow(!show); setSaved(""); }}><span /></button>
      </div>
      {error && <p role="alert" className="auth-error" style={{ marginTop: 10 }}>{error}</p>}
      {saved && <p role="status" className="editor-saved" style={{ marginTop: 10 }}><CheckCircle2 size={15} />{saved}</p>}
      {show !== persisted && (
        <button type="button" className="cred-save" style={{ marginTop: 10 }} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
          {busy ? "Salvando…" : "Salvar"}
        </button>
      )}
    </section>
  );
}
