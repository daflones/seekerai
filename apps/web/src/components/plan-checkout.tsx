"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle2, Copy, CreditCard, Loader2, QrCode } from "lucide-react";
import { callAction } from "@/lib/app-client";

interface PlanItem {
  slug: string;
  name: string;
  priceCents: number;
  featured: boolean;
  content: {
    description?: string;
    features?: { id: string; text: string; visible: boolean }[];
  };
}

interface PixResult {
  provider?: string;
  qrCode?: string | null;
  qrCodeImage?: string | null;
  expiresAt?: string | null;
  error?: string;
}

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PlanCheckout({ plans, hasSubscription }: {
  plans: PlanItem[];
  hasSubscription: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pix, setPix] = useState<{ plan: string } & PixResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function checkout(planSlug: string, method: "card" | "pix") {
    if (busy) return;
    setBusy(`${planSlug}:${method}`);
    setError("");
    setPix(null);
    const res = await callAction<{ checkoutUrl?: string } & PixResult>(
      "billing-checkout",
      { planSlug, method },
    );
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    if (method === "card" && res.data.checkoutUrl) {
      window.location.href = res.data.checkoutUrl;
      return;
    }
    setPix({ plan: planSlug, ...res.data });
  }

  async function copyPix(code: string) {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (hasSubscription) {
    return <p className="auth-success" role="status">
      <CheckCircle2 size={18} /> Você já possui uma assinatura em andamento. Os créditos do plano
      entram automaticamente a cada ciclo.
    </p>;
  }

  return <>
    <div className="plan-grid">
      {plans.map((plan) => <article key={plan.slug} className={`plan-card-checkout${plan.featured ? " featured" : ""}`}>
        {plan.featured && <span className="plan-flag">MAIS ESCOLHIDO</span>}
        <h3>{plan.name}</h3>
        <p className="plan-price">{brl(plan.priceCents)}<small>/mês</small></p>
        {plan.content.description && <p className="plan-tagline">{plan.content.description}</p>}
        {plan.content.features && <ul className="plan-features">
          {plan.content.features.filter((f) => f.visible).slice(0, 6).map((f) => <li key={f.id}>{f.text}</li>)}
        </ul>}
        <div className="plan-actions">
          <button type="button" className="button button-primary button-small" disabled={busy !== null}
            onClick={() => void checkout(plan.slug, "card")}>
            {busy === `${plan.slug}:card` ? <Loader2 size={14} className="spin" /> : <CreditCard size={14} />}
            Cartão
          </button>
          <button type="button" className="button button-glass button-small" disabled={busy !== null}
            onClick={() => void checkout(plan.slug, "pix")}>
            {busy === `${plan.slug}:pix` ? <Loader2 size={14} className="spin" /> : <QrCode size={14} />}
            PIX
          </button>
        </div>
      </article>)}
    </div>

    {error && <p role="alert" className="auth-error">{error}</p>}

    {pix && <section className="pix-panel">
      <h2><QrCode size={18} /> PIX gerado — {plans.find((p) => p.slug === pix.plan)?.name}</h2>
      {pix.qrCodeImage && <Image className="pix-qr" src={pix.qrCodeImage} alt="QR Code do PIX" width={210} height={210} unoptimized />}
      {pix.qrCode && <div className="pix-code">
        <code>{pix.qrCode}</code>
        <button type="button" className="button button-glass button-small" onClick={() => void copyPix(pix.qrCode!)}>
          <Copy size={14} />{copied ? "Copiado" : "Copiar código"}
        </button>
      </div>}
      <p className="seek-meta">
        Abra o app do seu banco, pague com o QR Code ou o código copia-e-cola.
        {pix.expiresAt && ` Válido até ${new Date(pix.expiresAt).toLocaleString("pt-BR")}.`}
        {" "}Assim que o pagamento confirmar, o plano ativa sozinho.
      </p>
    </section>}
  </>;
}
