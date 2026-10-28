"use client";

import { useState } from "react";
import { CalendarClock, CreditCard, QrCode, ShieldCheck } from "lucide-react";
import type { PlanCard, PlanSource } from "@/lib/plans/model";
import { BILLING_PERIODS, periodDef, periodTotalCents, type BillingPeriod } from "@/lib/plans/periods";
import { formatMoney, INTL_PRICES, type Locale } from "@/lib/i18n/shared";
import type { Messages } from "@/lib/i18n/messages";
import { PlanCardView } from "./plan-card";

export function Pricing({ plans, source, locale, t }: { plans: PlanCard[]; source: PlanSource; locale: Locale; t: Messages["pricing"] }) {
  const [method, setMethod] = useState(locale.isBrazil ? "pix" : "card");
  const [period, setPeriod] = useState<BillingPeriod>("mensal");
  const def = periodDef(period);
  // Legenda do total cobrado no ciclo ("R$ 53,97 a cada trimestre").
  const billedCaption = (plan: PlanCard) => {
    if (def.months === 1) return "";
    const base = locale.isBrazil ? plan.priceCents : INTL_PRICES[plan.slug] ?? plan.priceCents;
    const total = formatMoney(periodTotalCents(base, def), locale.currency, locale.lang);
    return `${total} ${period === "trimestral" ? t.billedTri : t.billedYear}`;
  };
  const periodLabel: Record<BillingPeriod, string> = {
    mensal: t.pMonthly, trimestral: t.pQuarterly, anual: t.pYearly,
  };
  return (
    <section id="planos" className="section pricing-section">
      <div className="section-heading centered"><span className="eyebrow">{t.eyebrow}</span><h2>{t.titleA}<br /><span className="muted-heading">{t.titleB}</span></h2><p>{t.sub}</p></div>
      <div className="billing-toggles">
        <div className="payment-toggle" role="group" aria-label={t.periodGroup}>
          {BILLING_PERIODS.map((p) => <button key={p.id} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
            <CalendarClock size={15} />{periodLabel[p.id]}
            {p.discountPct > 0 && <em className="toggle-off">-{p.discountPct}%</em>}
          </button>)}
        </div>
        {locale.isBrazil && (
          <div className="payment-toggle" role="group" aria-label={t.payGroup}>{[["pix", t.pix], ["card", t.card]].map(([id, label]) => <button key={id} aria-pressed={method === id} onClick={() => setMethod(id)}>{id === "pix" ? <QrCode size={15} /> : <CreditCard size={15} />}{label}</button>)}</div>
        )}
      </div>
      {plans.length > 0 ? <div className="plans-grid">{plans.map((plan) => <PlanCardView key={plan.slug} plan={plan} method={method} period={period} billedCaption={billedCaption(plan)} locale={locale} freeSuffix={t.freeSuffix} perMonth={t.perMonth} freeNote={t.freeNote} paidNote={t.paidNote} />)}</div>
        : <div className="plans-unavailable" role="status">{source === "unavailable" ? t.unavailable : t.preparing}</div>}
      <p className="pricing-note"><ShieldCheck size={15} />{source === "preview" ? t.notePreview : t.noteLive}</p>
      <p className="pricing-detail">
        {locale.isBrazil ? `${method === "pix" ? t.detailPix : t.detailCard} ${t.detailDemo}` : t.cardIntl}
      </p>
    </section>
  );
}
