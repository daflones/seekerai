"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, ChevronDown, Copy, CreditCard, Loader2, QrCode, Zap } from "lucide-react";
import type { BillingStatus } from "./checkout-success";
import { callAction } from "@/lib/app-client";
import { metaCookies, trackMeta } from "@/lib/meta";
import { CREDIT_PACKS, formatMoney, INTL_PRICES, type CreditPack, type Locale } from "@/lib/i18n/shared";
import { BILLING_PERIODS, periodDef, periodMonthlyCents, periodTotalCents, type BillingPeriod } from "@/lib/plans/periods";
import { getMessages, type Messages } from "@/lib/i18n/messages";

interface PlanItem {
  slug: string;
  name: string;
  priceCents: number;
  featured: boolean;
  order: number;
  content: {
    badge?: string;
    description?: string;
    features?: { id: string; text: string; visible: boolean }[];
    theme?: "cream" | "teal" | "violet" | "gold";
    buttonStyle?: "solid" | "light" | "outline";
  };
}

interface PixResult {
  provider?: string;
  reference?: string;
  qrCode?: string | null;
  qrCodeImage?: string | null;
  expiresAt?: string | null;
  error?: string;
}

export function PlanCheckout({ plans, allPlans, hasSubscription, currentPlanSlug, discountPct = 0, locale, t,
  subEnd = null, subMonths = 1, planCredits = {}, packs = CREDIT_PACKS }: {
  plans: PlanItem[];
  /** Lista completa (sem filtro de visibilidade) pra resolver o plano atual. */
  allPlans?: PlanItem[];
  hasSubscription: boolean;
  currentPlanSlug: string | null;
  discountPct?: number;
  locale: Locale;
  t: Messages["plansPage"];
  subEnd?: string | null;
  subMonths?: number;
  planCredits?: Record<string, number>;
  packs?: CreditPack[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pix, setPix] = useState<{ plan: string; pack?: CreditPack } & PixResult | null>(null);
  const [paid, setPaid] = useState<BillingStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>("mensal");

  // Polling da confirmação: o webhook do provedor marca o pagamento como
  // 'paid' e o modal vira tela de sucesso com plano/benefícios/saldo na hora.
  useEffect(() => {
    const ref = pix?.reference;
    if (!ref || paid) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/billing-status?ref=${encodeURIComponent(ref!)}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as BillingStatus;
          if (data.status === "paid" || data.active) {
            setPaid(data);
            router.refresh();
            trackMeta("Purchase", { content_name: pix!.pack ? `credit-pack-${pix!.pack.id}` : `plan-${pix!.plan}` });
            return;
          }
          if (data.status === "failed" || data.status === "expired") {
            setPix(null);
            setError(tc.paidFail);
            return;
          }
        }
      } catch { /* tenta de novo */ }
      if (!stop) timer = setTimeout(() => void poll(), 4000);
    }
    void poll();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pix?.reference, paid]);

  // Benefícios do card: no mobile começam recolhidos (accordion no próprio card).
  const moreRefs = useRef<(HTMLDetailsElement | null)[]>([]);
  useLayoutEffect(() => {
    if (!matchMedia("(max-width: 760px)").matches) return;
    for (const el of moreRefs.current) el?.removeAttribute("open");
  }, []);

  const isIntl = !locale.isBrazil;
  const tc = getMessages(locale.lang).common;
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
    const valueCents = pack ? packCents(pack) : disc(totalFor(lookup.find((p) => p.slug === planSlug)!));
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

  // Lookup contra a lista completa — o plano atual pode estar oculto da vitrine.
  const lookup = allPlans ?? plans;
  const current = lookup.find((p) => p.slug === currentPlanSlug) ?? null;
  // Troca em qualquer direção — upgrade e downgrade entram na mesma
  // grade; a flag do card diferencia.
  const changes = current
    ? plans.filter((p) => p.slug !== currentPlanSlug && p.priceCents > 0)
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
      {!isFree && discountPct > 0 && <span className="plan-off-tag">{discountPct}% {t.firstBuy}</span>}
      {!isFree && def.months > 1 && (
        <p className="plan-billed-caption">
          {money(disc(totalFor(plan)))} {period === "trimestral" ? t.billedTri : t.billedYear}
        </p>
      )}
      {plan.content.description && <p className="plan-tagline">{plan.content.description}</p>}
      {plan.content.features && <details className="plan-more" open
          ref={(el) => { moreRefs.current[plans.indexOf(plan)] = el; }}>
        <summary>{t.seeBenefits}<ChevronDown size={13} /></summary>
        <ul className="plan-features">
          {plan.content.features.filter((f) => f.visible).slice(0, 6).map((f) => <li key={f.id}>{f.text}</li>)}
        </ul>
      </details>}
      {isFree ? <p className="plan-current-note">{t.freeNote}</p> : planActions(plan)}
    </article>;
  }

  return <>
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

    {hasSubscription && changes.length > 0 && <section>
      <h3 className="pack-section-title">{t.changeTitle}</h3>
      <p className="pack-section-sub">{t.changeSub}</p>
      <div className="payment-toggle plan-period-toggle" role="group" aria-label={t.periodGroup}>
        {BILLING_PERIODS.map((p) => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
          <CalendarClock size={14} />{periodLabel[p.id]}
          {p.discountPct > 0 && <em className="toggle-off">{p.discountPct}%</em>}
        </button>)}
      </div>
      <div className="plan-grid plan-grid-upgrades">
        {changes.map((plan) => planCard(plan,
          plan.order > (current?.order ?? 0) ? t.upgradeFlag : t.downgradeFlag))}
      </div>
    </section>}

    {hasSubscription && changes.length === 0 && current
      && lookup.every((p) => p.slug === current.slug || p.order <= current.order) && (
      <p className="auth-success" role="status"><CheckCircle2 size={18} /> {t.topPlan}</p>
    )}

    {!hasSubscription && <>
      <div className="payment-toggle plan-period-toggle" role="group" aria-label={t.periodGroup}>
        {BILLING_PERIODS.map((p) => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
          <CalendarClock size={14} />{periodLabel[p.id]}
          {p.discountPct > 0 && <em className="toggle-off">{p.discountPct}%</em>}
        </button>)}
      </div>
      <div className="plan-grid">
        {plans.map((plan) => planCard(plan, plan.featured ? t.featured : null))}
      </div>
    </>}

    {hasSubscription && packs.length > 0 && <section id="creditos" className="pack-section">
      <h3 className="pack-section-title">{t.packTitle}</h3>
      <p className="pack-section-sub">{t.packSub}</p>
      <div className="pack-rows">
        {packs.map((pack) => <article key={pack.id} className="pack-row">
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
      onClick={() => { setPix(null); setPaid(null); }}>
      <section className="pix-panel pix-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pix-close" aria-label="×" onClick={() => { setPix(null); setPaid(null); }}>×</button>
        {paid ? (() => {
          const paidPlan = lookup.find((p) => p.slug === (paid.planSlug ?? pix.plan));
          const feats = paidPlan?.content.features?.filter((f) => f.visible).slice(0, 6) ?? [];
          return <div className="pix-paid" role="status">
            <CheckCircle2 size={42} className="pix-paid-check" />
            <h2>{tc.paidT}</h2>
            <p className="pix-paid-plan">
              {pix.pack ? `+${pix.pack.credits} ${t.packCredits}` : paidPlan?.name}
            </p>
            {(paid.credits ?? 0) > 0 && (
              <span className="paid-credits"><Zap size={13} />+{paid.credits} {tc.paidCredits}</span>
            )}
            {feats.length > 0 && <ul className="paid-benefits">
              {feats.map((f) => <li key={f.id}><CheckCircle2 size={12} />{f.text}</li>)}
            </ul>}
            <Link href="/app/buscar" className="button button-primary button-small">{tc.paidCta}</Link>
          </div>;
        })() : <>
          <h2><QrCode size={18} /> {t.pixPay} {pix.pack ? `+${pix.pack.credits}` : lookup.find((p) => p.slug === pix.plan)?.name}</h2>
          <p className="plan-price pix-price">{money(pix.pack ? packCents(pix.pack) : disc(priceFor(lookup.find((p) => p.slug === pix.plan)!)))}{!pix.pack && <small>{t.perMonth}</small>}</p>
          {!pix.pack && def.months > 1 && (
            <p className="plan-billed-caption">
              {money(disc(totalFor(lookup.find((p) => p.slug === pix.plan)!)))}
              {" "}{period === "trimestral" ? t.billedTri : t.billedYear}
            </p>
          )}
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
          <p className="pix-waiting"><Loader2 size={13} className="spin" /> {tc.paidChecking}</p>
        </>}
      </section>
    </div>}
  </>;
}
