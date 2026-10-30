"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CalendarClock, CheckCircle2, Copy, CreditCard, Loader2, QrCode } from "lucide-react";
import { callAction } from "@/lib/app-client";
import { metaCookies, trackMeta } from "@/lib/meta";
import { CREDIT_PACKS, formatMoney, INTL_PRICES, type CreditPack, type Locale } from "@/lib/i18n/shared";
import { BILLING_PERIODS, periodDef, periodMonthlyCents, periodTotalCents, type BillingPeriod } from "@/lib/plans/periods";
import type { Messages } from "@/lib/i18n/messages";

interface PlanItem {
  slug: string;
  name: string;
  priceCents: number;
  featured: boolean;
  order: number;
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

export function PlanCheckout({ plans, hasSubscription, currentPlanSlug, discountPct = 0, locale, t,
  subEnd = null, subMonths = 1, planCredits = {} }: {
  plans: PlanItem[];
  hasSubscription: boolean;
  currentPlanSlug: string | null;
  discountPct?: number;
  locale: Locale;
  t: Messages["plansPage"];
  subEnd?: string | null;
  subMonths?: number;
  planCredits?: Record<string, number>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pix, setPix] = useState<{ plan: string; pack?: CreditPack } & PixResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>("mensal");
  const [canceled, setCanceled] = useState(false);

  // Retorno do Stripe com checkout cancelado — aviso leve acima dos planos.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "cancelado") {
      setCanceled(true);
    }
  }, []);

  const isIntl = !locale.isBrazil;
  const money = (cents: number) => formatMoney(cents, locale.currency, locale.lang);
  const def = periodDef(period);
  // Gringo: preços em USD/EUR ($5/$15/$25). Brasil: preço em BRL vindo do banco.
  const priceFor = (plan: PlanItem) =>
    periodMonthlyCents(isIntl ? (INTL_PRICES[plan.slug] ?? 0) : plan.priceCents, def);
  const totalFor = (plan: PlanItem) =>
    periodTotalCents(isIntl ? (INTL_PRICES[plan.slug] ?? 0) : plan.priceCents, def);
  const packCents = (pack: CreditPack) => isIntl ? pack.intlCents : pack.brlCents;
  // Desconto de primeira compra — mesmo arredondamento da edge.
  const disc = (cents: number) =>
    discountPct > 0 ? Math.max(100, Math.round(cents * (100 - discountPct) / 100)) : cents;
  const periodLabel: Record<BillingPeriod, string> = {
    mensal: t.pMonthly, trimestral: t.pQuarterly, anual: t.pYearly,
  };

  async function checkout(planSlug: string, method: "card" | "pix", pack?: CreditPack) {
    if (busy) return;
    setBusy(`${planSlug}:${method}`);
    setError("");
    setPix(null);
    const payload = pack
      ? { creditPack: true, packId: pack.id, method, currency: locale.currency, ...metaCookies() }
      : { planSlug, method, currency: locale.currency, period, ...metaCookies() };
    const valueCents = pack ? packCents(pack) : disc(totalFor(plans.find((p) => p.slug === planSlug)!));
    trackMeta("InitiateCheckout", {
      value: valueCents / 100,
      currency: locale.currency.toUpperCase(),
      content_name: pack ? `credit-pack-${pack.id}` : `plan-${planSlug}-${period}`,
    });
    const res = await callAction<{ checkoutUrl?: string } & PixResult>("billing-checkout", payload);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    if (method === "card" && res.data.checkoutUrl) {
      window.location.href = res.data.checkoutUrl;
      return;
    }
    setPix({ plan: planSlug, pack, ...res.data });
  }

  async function copyPix(code: string) {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const current = plans.find((p) => p.slug === currentPlanSlug) ?? null;
  const upgrades = current
    ? plans.filter((p) => p.order > current.order)
    : [];
  const renewDate = subEnd
    ? new Date(subEnd).toLocaleDateString(locale.lang === "pt" ? "pt-BR" : locale.lang)
    : null;

  function planActions(plan: PlanItem) {
    return <div className="plan-actions">
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
    </div>;
  }

  function planCard(plan: PlanItem, flag?: string | null) {
    const isFree = plan.priceCents === 0;
    return <article key={plan.slug} className={`plan-card-checkout${plan.featured ? " featured" : ""}`}>
      {flag && <span className="plan-flag">{flag}</span>}
      <h3>{plan.name}</h3>
      <p className="plan-price">
        {!isFree && discountPct > 0 && <s className="plan-price-was">{money(priceFor(plan))}</s>}
        {isFree ? money(0) : money(disc(priceFor(plan)))}
        {!isFree && <small>{t.perMonth}</small>}
      </p>
      {!isFree && discountPct > 0 && <span className="plan-off-tag">-{discountPct}% {t.firstBuy}</span>}
      {!isFree && def.months > 1 && (
        <p className="plan-billed-caption">
          {money(disc(totalFor(plan)))} {period === "trimestral" ? t.billedTri : t.billedYear}
        </p>
      )}
      {plan.content.description && <p className="plan-tagline">{plan.content.description}</p>}
      {plan.content.features && <ul className="plan-features">
        {plan.content.features.filter((f) => f.visible).slice(0, 6).map((f) => <li key={f.id}>{f.text}</li>)}
      </ul>}
      {isFree ? <p className="plan-current-note">{t.freeNote}</p> : planActions(plan)}
    </article>;
  }

  return <>
    {canceled && <p className="seek-meta" role="status">{t.cancelNote}</p>}

    {hasSubscription && current && <section className="plan-now">
      <div className="plan-now-info">
        <small>{t.yourPlan}</small>
        <strong>{current.name}</strong>
        <span>
          {subMonths > 1 ? `${money(disc(totalFor(current)))} ${subMonths === 3 ? t.billedTri : t.billedYear}`
            : `${money(priceFor(current))}${t.perMonth}`}
          {planCredits[current.slug] ? ` · ${planCredits[current.slug]} ${t.creditsCycle}` : ""}
          {renewDate ? ` · ${t.renewsIn} ${renewDate}` : ""}
        </span>
      </div>
      <CheckCircle2 size={22} className="plan-now-check" />
    </section>}

    {hasSubscription && upgrades.length > 0 && <section>
      <h3 className="pack-section-title">{t.upTitle}</h3>
      <p className="pack-section-sub">{t.upSub}</p>
      <div className="payment-toggle plan-period-toggle" role="group" aria-label={t.periodGroup}>
        {BILLING_PERIODS.map((p) => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
          <CalendarClock size={14} />{periodLabel[p.id]}
          {p.discountPct > 0 && <em className="toggle-off">-{p.discountPct}%</em>}
        </button>)}
      </div>
      <div className="plan-grid plan-grid-upgrades">
        {upgrades.map((plan) => planCard(plan, t.upgradeFlag))}
      </div>
    </section>}

    {hasSubscription && upgrades.length === 0 && current && (
      <p className="auth-success" role="status"><CheckCircle2 size={18} /> {t.topPlan}</p>
    )}

    {!hasSubscription && <>
      <div className="payment-toggle plan-period-toggle" role="group" aria-label={t.periodGroup}>
        {BILLING_PERIODS.map((p) => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
          <CalendarClock size={14} />{periodLabel[p.id]}
          {p.discountPct > 0 && <em className="toggle-off">-{p.discountPct}%</em>}
        </button>)}
      </div>
      <div className="plan-grid">
        {plans.map((plan) => planCard(plan, plan.featured ? t.featured : null))}
      </div>
    </>}

    {hasSubscription && <section id="creditos" className="pack-section">
      <h3 className="pack-section-title">{t.packTitle}</h3>
      <p className="pack-section-sub">{t.packSub}</p>
      <div className="pack-rows">
        {CREDIT_PACKS.map((pack) => <article key={pack.id} className="pack-row">
          <div className="pack-amount"><strong>+{pack.credits}</strong><small>{t.packCredits}</small></div>
          <div className="pack-price">
            <strong>{money(packCents(pack))}</strong>
            <small>{money(Math.round(packCents(pack) / pack.credits))}{t.perCredit}</small>
          </div>
          <div className="plan-actions">
            <button type="button" className="button button-primary button-small" disabled={busy !== null}
              onClick={() => void checkout(pack.id, "card", pack)}>
              {busy === `${pack.id}:card` ? <Loader2 size={14} className="spin" /> : <CreditCard size={14} />}
              {t.card}
            </button>
            {!isIntl && <button type="button" className="button button-glass button-small" disabled={busy !== null}
              onClick={() => void checkout(pack.id, "pix", pack)}>
              {busy === `${pack.id}:pix` ? <Loader2 size={14} className="spin" /> : <QrCode size={14} />}
              PIX
            </button>}
          </div>
        </article>)}
      </div>
    </section>}

    {error && <p role="alert" className="auth-error">{error}</p>}

    {pix && <div className="pix-overlay" role="dialog" aria-modal="true" aria-label="PIX"
      onClick={() => setPix(null)}>
      <section className="pix-panel pix-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pix-close" aria-label="×" onClick={() => setPix(null)}>×</button>
        <h2><QrCode size={18} /> {t.pixPay} {pix.pack ? `+${pix.pack.credits}` : plans.find((p) => p.slug === pix.plan)?.name}</h2>
        <p className="plan-price pix-price">{money(pix.pack ? packCents(pix.pack) : priceFor(plans.find((p) => p.slug === pix.plan)!))}{!pix.pack && <small>{t.perMonth}</small>}</p>
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
