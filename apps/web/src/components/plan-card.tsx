import Link from "next/link";
import { ArrowUpRight, Bot, Check, Crown, Globe, Sparkles, Zap } from "lucide-react";
import { formatPlanPrice, type PlanCard } from "@/lib/plans/model";
import { periodDef, periodMonthlyCents, type BillingPeriod } from "@/lib/plans/periods";
import { formatMoney, INTL_PRICES, type Locale } from "@/lib/i18n/shared";
import { planText } from "@/lib/catalog-i18n";

const featureIcons = { check: Check, bot: Bot, sparkles: Sparkles, globe: Globe };

export function PlanCardView({
  plan,
  method = "pix",
  period = "mensal",
  billedCaption = "",
  preview = false,
  locale,
  freeSuffix = "/ para conhecer",
  perMonth = "/ mês",
  freeNote = "Conheça antes de decidir.",
  paidNote = "Sua próxima fase, no seu ritmo.",
}: {
  plan: PlanCard;
  method?: string;
  period?: BillingPeriod;
  /** "R$ 53,97 a cada trimestre" — linha pequena sob o preço. */
  billedCaption?: string;
  preview?: boolean;
  locale?: Locale;
  freeSuffix?: string;
  perMonth?: string;
  freeNote?: string;
  paidNote?: string;
}) {
  const { content } = plan;
  const lang = locale?.lang ?? "pt";
  const L = (s: string) => planText(s, lang);
  const BadgeIcon = plan.slug === "king" ? Crown : plan.featured ? Sparkles : Zap;
  const isIntl = locale && !locale.isBrazil;
  const intlCents = isIntl ? INTL_PRICES[plan.slug] : undefined;
  return <article className={`plan-card plan-theme-${content.theme}${plan.featured ? " plan-featured" : ""}`}>
    {content.badge && <span className="plan-tag"><BadgeIcon size={11} />{L(content.badge)}</span>}
    <div className="plan-title-row"><h3>{L(plan.name)}</h3>{plan.featured && <span className="plan-orbit-dot" aria-hidden="true" />}</div>
    {isIntl
      ? <div className="plan-price">{intlCents !== undefined
          ? <>{formatMoney(periodMonthlyCents(intlCents, periodDef(period)), locale.currency, locale.lang)}<small>{perMonth}</small></>
          : <>{formatMoney(0, locale.currency, locale.lang)}<small>{freeSuffix}</small></>}</div>
      : <div className="plan-price"><span>R$</span>{formatPlanPrice(periodMonthlyCents(plan.priceCents, periodDef(period)))}<small>{plan.slug === "gratis" ? freeSuffix : perMonth}</small></div>}
    {billedCaption && <span className="plan-billed-note">{billedCaption}</span>}
    <p className="plan-description">{L(content.description)}</p>
    <span className="plan-divider" />
    <ul>{content.features.filter((feature) => feature.visible).map((feature) => {
      const Icon = featureIcons[feature.icon];
      return <li key={feature.id} className={feature.highlight ? "plan-benefit-highlight" : ""}><span className="plan-benefit-icon"><Icon size={13} /></span><span>{L(feature.text)}</span></li>;
    })}</ul>
    <div className="plan-card-bottom">
      {preview
        ? <button type="button" disabled className={`button plan-cta cta-${content.buttonStyle}`}>{L(content.cta)}<ArrowUpRight size={15} /></button>
        : <Link href={`/cadastro?plano=${plan.slug}&metodo=${method}&periodo=${period}`} className={`button plan-cta cta-${content.buttonStyle}`}>{L(content.cta)}<ArrowUpRight size={15} /></Link>}
      <span className="plan-card-microcopy">{plan.slug === "gratis" ? freeNote : paidNote}</span>
    </div>
  </article>;
}
