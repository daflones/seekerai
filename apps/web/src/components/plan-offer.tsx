"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatMoney, type Currency } from "@/lib/i18n/shared";
import { getMessages } from "@/lib/i18n/messages";

interface OfferPlan {
  slug: string;
  name: string;
  featured: boolean;
  cta: string;
  priceCents: number;
  wasCents: number | null;
}

interface Offers {
  plans: OfferPlan[];
  discountPct: number;
  currency: Currency;
}

// Cards compactos de plano pros momentos de venda dentro do app
// (modal de upgrade, aviso de créditos). Busca /api/plans-public —
// os preços já vêm com o desconto de 1ª compra aplicado, igual ao checkout.
export function PlanOffer({ lang, href = "/app/planos", t }: {
  lang: Parameters<typeof getMessages>[0];
  href?: string;
  t?: { perMonth: string; firstBuy: string; featured: string };
}) {
  const [offers, setOffers] = useState<Offers | null>(null);

  useEffect(() => {
    let stop = false;
    fetch("/api/plans-public", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Offers | null) => { if (!stop && data?.plans?.length) setOffers(data); })
      .catch(() => {});
    return () => { stop = true; };
  }, []);

  if (!offers) return null;
  const tt = t ?? {
    perMonth: getMessages(lang).pricing.perMonth,
    firstBuy: getMessages(lang).pricing.firstBuy,
    featured: getMessages(lang).plansPage.featured,
  };
  const money = (cents: number) => formatMoney(cents, offers.currency, lang);

  return <div className="upsell-plans">
    {offers.plans.map((p) => (
      <Link key={p.slug} href={href} className={`cta-plan upsell-plan${p.featured ? " is-featured" : ""}`}>
        {p.featured && <span className="upsell-flag">{tt.featured}</span>}
        <strong>{p.name}</strong>
        <span className="cta-plan-price">
          {p.wasCents != null && <s className="cta-plan-was">{money(p.wasCents)}</s>}
          {money(p.priceCents)}<small>{tt.perMonth}</small>
        </span>
        {offers.discountPct > 0 && <em className="upsell-off">{offers.discountPct}% {tt.firstBuy}</em>}
        <em className="upsell-cta">{p.cta} <ArrowUpRight size={12} /></em>
      </Link>
    ))}
  </div>;
}
