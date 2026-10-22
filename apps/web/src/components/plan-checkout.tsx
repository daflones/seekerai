"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle2, Copy, CreditCard, Loader2, QrCode } from "lucide-react";
import { callAction } from "@/lib/app-client";
import { formatMoney, INTL_PACK_CENTS, INTL_PRICES, type Locale } from "@/lib/i18n/shared";
import type { Messages } from "@/lib/i18n/messages";

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

export function PlanCheckout({ plans, hasSubscription, currentPlanSlug, locale, t }: {
  plans: PlanItem[];
  hasSubscription: boolean;
  currentPlanSlug: string | null;
  locale: Locale;
  t: Messages["plansPage"];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pix, setPix] = useState<{ plan: string } & PixResult | null>(null);
  const [copied, setCopied] = useState(false);

  const isIntl = !locale.isBrazil;
  const money = (cents: number) => formatMoney(cents, locale.currency, locale.lang);
  // Gringo: preços em USD/EUR ($5/$15/$25). Brasil: preço em BRL vindo do banco.
  const priceFor = (plan: PlanItem) =>
    isIntl ? (INTL_PRICES[plan.slug] ?? 0) : plan.priceCents;
  const packCents = isIntl ? INTL_PACK_CENTS : 2000;

  async function checkout(planSlug: string, method: "card" | "pix") {
    if (busy) return;
    setBusy(`${planSlug}:${method}`);
    setError("");
    setPix(null);
    const payload = planSlug === "credit-pack"
      ? { creditPack: true, method, currency: locale.currency }
      : { planSlug, method, currency: locale.currency };
    const res = await callAction<{ checkoutUrl?: string } & PixResult>("billing-checkout", payload);
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

  return <>
    {hasSubscription && <p className="auth-success" role="status">
      <CheckCircle2 size={18} /> {t.hasSub}
    </p>}

    <div className="plan-grid">
      {plans.map((plan) => {
        const isCurrent = plan.slug === currentPlanSlug;
        const isFree = plan.priceCents === 0;
        return <article key={plan.slug} className={`plan-card-checkout${plan.featured ? " featured" : ""}${isCurrent ? " current" : ""}`}>
          {isCurrent && <span className="plan-flag plan-flag-current">{t.current}</span>}
          {!isCurrent && plan.featured && <span className="plan-flag">{t.featured}</span>}
          <h3>{plan.name}</h3>
          <p className="plan-price">{isFree ? money(0) : money(priceFor(plan))}{!isFree && <small>{t.perMonth}</small>}</p>
          {plan.content.description && <p className="plan-tagline">{plan.content.description}</p>}
          {plan.content.features && <ul className="plan-features">
            {plan.content.features.filter((f) => f.visible).slice(0, 6).map((f) => <li key={f.id}>{f.text}</li>)}
          </ul>}
          {isCurrent
            ? <p className="plan-current-note">{t.currentNote}</p>
            : isFree
              ? <p className="plan-current-note">{t.freeNote}</p>
              : <div className="plan-actions">
                <button type="button" className="button button-primary button-small" disabled={busy !== null}
                  onClick={() => void checkout(plan.slug, "card")}>
                  {busy === `${plan.slug}:card` ? <Loader2 size={14} className="spin" /> : <CreditCard size={14} />}
                  {t.card}
                </button>
                {!isIntl && <button type="button" className="button button-glass button-small" disabled={busy !== null}
                  onClick={() => void checkout(plan.slug, "pix")}>
                  {busy === `${plan.slug}:pix` ? <Loader2 size={14} className="spin" /> : <QrCode size={14} />}
                  PIX
                </button>}
              </div>}
        </article>;
      })}
    </div>

    {hasSubscription && <article className="plan-card-checkout credit-pack">
      <h3>{t.packTitle}</h3>
      <p className="plan-price">{money(packCents)}</p>
      <p className="plan-tagline">+50 {t.packSub}</p>
      <div className="plan-actions">
        <button type="button" className="button button-primary button-small" disabled={busy !== null}
          onClick={() => void checkout("credit-pack", "card")}>
          {busy === "credit-pack:card" ? <Loader2 size={14} className="spin" /> : <CreditCard size={14} />}
          {t.card}
        </button>
        {!isIntl && <button type="button" className="button button-glass button-small" disabled={busy !== null}
          onClick={() => void checkout("credit-pack", "pix")}>
          {busy === "credit-pack:pix" ? <Loader2 size={14} className="spin" /> : <QrCode size={14} />}
          PIX
        </button>}
      </div>
    </article>}

    {error && <p role="alert" className="auth-error">{error}</p>}

    {pix && <div className="pix-overlay" role="dialog" aria-modal="true" aria-label="PIX"
      onClick={() => setPix(null)}>
      <section className="pix-panel pix-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pix-close" aria-label="×" onClick={() => setPix(null)}>×</button>
        <h2><QrCode size={18} /> {t.pixPay} {pix.plan === "credit-pack" ? "+50" : plans.find((p) => p.slug === pix.plan)?.name}</h2>
        <p className="plan-price pix-price">{money(pix.plan === "credit-pack" ? packCents : priceFor(plans.find((p) => p.slug === pix.plan)!))}{pix.plan !== "credit-pack" && <small>{t.perMonth}</small>}</p>
        {pix.qrCodeImage && <Image className="pix-qr" src={pix.qrCodeImage} alt="QR Code PIX" width={210} height={210} unoptimized />}
        {pix.qrCode && <div className="pix-code">
          <code>{pix.qrCode}</code>
          <button type="button" className="button button-glass button-small" onClick={() => void copyPix(pix.qrCode!)}>
            <Copy size={14} />{copied ? t.pixCopied : t.pixCopy}
          </button>
        </div>}
        <p className="seek-meta">
          {t.pixHint}
          {pix.expiresAt && ` ${t.pixValid} ${new Date(pix.expiresAt).toLocaleString()}.`}
          {" "}{t.pixAuto}
        </p>
      </section>
    </div>}
  </>;
}
