"use client";

import { useState } from "react";
import { CreditCard, QrCode, ShieldCheck } from "lucide-react";
import type { PlanCard, PlanSource } from "@/lib/plans/model";
import type { Locale } from "@/lib/i18n/shared";
import type { Messages } from "@/lib/i18n/messages";
import { PlanCardView } from "./plan-card";

export function Pricing({ plans, source, locale, t }: { plans: PlanCard[]; source: PlanSource; locale: Locale; t: Messages["pricing"] }) {
  const [method, setMethod] = useState(locale.isBrazil ? "pix" : "card");
  return (
    <section id="planos" className="section pricing-section">
      <div className="section-heading centered"><span className="eyebrow">{t.eyebrow}</span><h2>{t.titleA}<br /><span className="muted-heading">{t.titleB}</span></h2><p>{t.sub}</p></div>
      {locale.isBrazil && (
        <div className="payment-toggle" role="group" aria-label={t.payGroup}>{[["pix", t.pix], ["card", t.card]].map(([id, label]) => <button key={id} aria-pressed={method === id} onClick={() => setMethod(id)}>{id === "pix" ? <QrCode size={15} /> : <CreditCard size={15} />}{label}</button>)}</div>
      )}
      {plans.length > 0 ? <div className="plans-grid">{plans.map((plan) => <PlanCardView key={plan.slug} plan={plan} method={method} locale={locale} freeSuffix={t.freeSuffix} perMonth={t.perMonth} freeNote={t.freeNote} paidNote={t.paidNote} />)}</div>
        : <div className="plans-unavailable" role="status">{source === "unavailable" ? t.unavailable : t.preparing}</div>}
      <p className="pricing-note"><ShieldCheck size={15} />{source === "preview" ? t.notePreview : t.noteLive}</p>
      <p className="pricing-detail">
        {locale.isBrazil ? `${method === "pix" ? t.detailPix : t.detailCard} ${t.detailDemo}` : t.cardIntl}
      </p>
    </section>
  );
}
