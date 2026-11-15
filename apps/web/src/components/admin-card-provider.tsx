"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, Loader2, Save } from "lucide-react";

export function AdminCardProvider({ initialProvider }: { initialProvider: string }) {
  const [provider, setProvider] = useState<"stripe" | "mercadopago">(
    initialProvider === "mercadopago" ? "mercadopago" : "stripe",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    const res = await fetch("/api/admin/card-provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) { setError(body?.error ?? "Não foi possível salvar."); return; }
    setNotice(body?.message ?? "Salvo.");
  }

  return (
    <section className="dash-panel">
      <h2><CreditCard size={16} /> Pagamento no cartão (Brasil)</h2>
      <p className="dash-hint">
        Define quem processa o checkout de cartão em R$ — planos, créditos avulsos e domínios.
        Com Stripe, se a API falhar o pedido cai automaticamente pro Mercado Pago.
        Internacional (US$/€/£) é sempre Stripe.
      </p>
      <div className="editor-fields">
        <div className="editor-checks" role="radiogroup" aria-label="Provedor de cartão">
          <label>
            <input type="radio" name="card-provider" checked={provider === "stripe"}
              onChange={() => setProvider("stripe")} />
            Stripe
          </label>
          <label>
            <input type="radio" name="card-provider" checked={provider === "mercadopago"}
              onChange={() => setProvider("mercadopago")} />
            Mercado Pago
          </label>
        </div>
        <button type="button" className="button button-primary" disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
          {busy ? "Salvando…" : "Salvar provedor"}
        </button>
      </div>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {notice && <p role="status" className="editor-saved"><CheckCircle2 size={15} />{notice}</p>}
      <p className="dash-hint">
        Status: {provider === "stripe" ? "Stripe (Mercado Pago só como fallback)" : "Mercado Pago"}
      </p>
    </section>
  );
}
