import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Bookmark, Check, ChevronDown, Globe, MessageCircle, Play, ShieldCheck, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { Navigation } from "@/components/navigation";
import { Pricing } from "@/components/pricing";
import { ProductDemo } from "@/components/product-demo";
import { publicPlanCards } from "@/lib/plans/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatPlanPrice } from "@/lib/plans/model";
import { formatMoney, planIntlCents } from "@/lib/i18n/shared";
import { getLocale, getTheme } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { verifiedSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { LandingCopilot, LandingHeroVisual, LandingJourney, LandingNiches } from "@/components/landing-experience";
import { LandingShowcase, LandingVideo } from "@/components/landing-media";
import { getLandingMessages } from "@/lib/i18n/landing-messages";
import { publicLandingContent } from "@/lib/landing-server";
import { videoSource } from "@/lib/landing-content";
import "./landing-ui.css";

export const dynamic = "force-dynamic";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://seekerai.digital";

export async function generateMetadata(): Promise<Metadata> {
  const loc = await getLocale();
  const copy = getLandingMessages(loc.lang);
  return {
    title: { absolute: copy.metaTitle },
    description: copy.metaDescription,
    openGraph: { title: copy.metaTitle, description: copy.metaDescription },
    twitter: { title: copy.metaTitle, description: copy.metaDescription },
  };
}

// Preços da landing são configuráveis no admin (/admin/planos →
// "Preços na landing", app_settings.landing_show_prices). Ligado:
// cards reais, "a partir de" no hero, CTA final e JSON-LD. Desligado:
// a seção #planos vira CTA pro cadastro e o preço só aparece no app.
// Chave ausente = ligado (comportamento padrão).

export default async function Home() {
  // Logado não vê landing — vai direto pro painel.
  if (await verifiedSession()) redirect("/app");
  const [loc, theme] = await Promise.all([getLocale(), getTheme()]);
  const t = getMessages(loc.lang);
  const h = t.home;
  const l = getLandingMessages(loc.lang);
  const admin = createSupabaseAdminClient();
  // Prova social busca os totais reais sempre; preços e desconto só
  // quando a vitrine está ligada no admin.
  const [{ data: priceRow }, { count: leadsCount }, { count: sitesCount }, landing] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "landing_show_prices").maybeSingle(),
    admin.from("leads").select("id", { count: "exact", head: true }),
    admin.from("sites").select("slug", { count: "exact", head: true }).eq("publicado", true),
    publicLandingContent(),
  ]);
  const SHOW_LANDING_PRICES = priceRow?.value !== false;
  const [pricing, { data: discRow }] = await Promise.all([
    SHOW_LANDING_PRICES
      ? publicPlanCards()
      : Promise.resolve<Awaited<ReturnType<typeof publicPlanCards>>>({ plans: [], source: "preview" }),
    SHOW_LANDING_PRICES
      ? admin.from("app_settings").select("value").eq("key", "first_purchase_discount_pct").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const discountPct = Math.min(90, Math.max(0, Math.trunc(Number(discRow?.value ?? 0)) || 0));
  const disc = (cents: number) =>
    discountPct > 0 ? Math.max(100, Math.round(cents * (100 - discountPct) / 100)) : cents;
  // "A partir de R$ X/mês" no hero — menor plano visível já com o
  // desconto de 1ª compra aplicado (mesmo número que o checkout cobra).
  const paidPrices = pricing.plans.filter((p) => p.priceCents > 0)
    .map((p) => disc(loc.isBrazil ? p.priceCents : planIntlCents(p, loc.currency) ?? p.priceCents));
  const fromCents = paidPrices.length ? Math.min(...paidPrices) : 0;
  const priceFrom = fromCents > 0
    ? h.rePrice.replace("{price}", loc.isBrazil
        ? `R$ ${formatPlanPrice(fromCents)}`
        : formatMoney(fromCents, loc.currency, loc.lang))
      + (discountPct > 0 ? ` · ${discountPct}% ${t.pricing.firstBuy}` : "")
    : "";
  const video = landing.content.video_enabled ? videoSource(landing.content.video_urls[loc.lang] ?? "") : null;
  const showPlans = SHOW_LANDING_PRICES ? pricing.plans.length > 0 : true;
  const faqs = [...l.faqs, h.faqs[0], h.faqs[3]];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "SeekerAi",
        url: appUrl,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: { pt: "pt-BR", en: "en", es: "es", fr: "fr", de: "de", it: "it" }[loc.lang],
        description: l.metaDescription,
        ...(SHOW_LANDING_PRICES && fromCents > 0 ? {
          offers: { "@type": "Offer", price: (fromCents / 100).toFixed(2), priceCurrency: loc.currency.toUpperCase() },
        } : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Navigation t={t.nav} locale={loc} theme={theme} showPlans={showPlans}
        productLinks={[[l.navSites, "#sites-ia"], [l.navMessages, "#abordagens"]]} />
      <main id="conteudo" className="landing-v2">
        <section className="lp-hero">
          <div className="container lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-kicker"><span className="status-dot" />{l.heroKicker}</span>
              <h1>{l.heroTitle}<br /><span>{l.heroAccent}</span></h1>
              <p>{l.heroDescription}</p>
              <div className="lp-hero-actions"><Link href="/cadastro" className="button button-primary">{l.primaryCta}<ArrowUpRight size={17} /></Link><a href="#como-funciona" className="button button-glass"><Play size={14} />{l.previewCta}</a></div>
              <div className="lp-hero-checks"><span><Check size={14} />{h.re2}</span><span><Check size={14} />{h.re3}</span></div>
              <small className="lp-hero-note">{l.heroNote}</small>
              {priceFrom && <span className="lp-price-from">{priceFrom}</span>}
            </div>
            <LandingHeroVisual t={l} />
          </div>
          <div className="container lp-audience"><span>{h.madeFor}</span><div>{[h.seg1, h.seg2, h.seg3, h.seg4].map((label) => <span key={label}>{label}</span>)}</div></div>
        </section>

      {(leadsCount ?? 0) > 0 && (
        <div className="container social-proof">
          <span><strong>{(leadsCount ?? 0).toLocaleString(loc.lang === "pt" ? "pt-BR" : loc.lang)}+</strong> {h.spFound}</span>
          {(sitesCount ?? 0) > 0 && <span><strong>{sitesCount!.toLocaleString(loc.lang === "pt" ? "pt-BR" : loc.lang)}+</strong> {h.spSites}</span>}
          <span className="social-proof-note">{h.spNote}</span>
        </div>
      )}

        <LandingJourney t={l} />
        <LandingNiches t={l} />
        <LandingShowcase sites={landing.sites} t={l.gallery} />
        {video && <LandingVideo source={video} t={l.video} />}
        <LandingCopilot t={l} />
        <section id="demonstracao" className="lp-section lp-search-section">
          <div className="container"><div className="lp-heading"><span className="eyebrow">{h.feyebrow}</span><h2>{l.searchTitle}</h2><p>{l.searchDescription}</p></div><ProductDemo loc={loc} t={t.demo} /></div>
        </section>
        <section id="recursos" className="lp-section lp-tools-section"><div className="container">
          <div className="lp-heading"><span className="eyebrow">{l.tools.kicker}</span><h2>{l.tools.title}</h2></div>
          <div className="lp-tools-grid">{l.tools.items.map(([title, description], i) => {
            const Icon = [Globe, MessageCircle, Bookmark, Sparkles][i];
            return <article key={title}><span className="lp-big-icon"><Icon size={24} /></span><h3>{title}</h3><p>{description}</p></article>;
          })}</div><p className="lp-small-note">{l.tools.note}</p>
        </div></section>

        {SHOW_LANDING_PRICES && pricing.plans.length === 0 ? null : <div className="container">{SHOW_LANDING_PRICES
          ? <Pricing plans={pricing.plans} source={pricing.source} locale={loc} t={t.pricing} discountPct={discountPct} />
          : <section id="planos" className="section pricing-section">
              <div className="section-heading centered"><span className="eyebrow">{t.pricing.eyebrow}</span><h2>{t.pricing.titleA}<br /><span className="muted-heading">{t.pricing.titleB}</span></h2><p>{t.pricing.sub}</p></div>
              <div className="pricing-cta"><Link href="/cadastro" className="button button-primary">{h.ctab} <ArrowUpRight size={16} /></Link><p className="pricing-note"><ShieldCheck size={15} />{h.ctanote}</p></div>
            </section>}</div>}

        <section className="section faq-section light-section"><div className="container faq-layout"><div className="section-heading"><span className="eyebrow">{h.faqeyebrow}</span><h2>{h.faqtitleA}<br />{h.faqtitleB}</h2><p>{h.faqp}</p></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</div></div></section>

        <section className="final-cta"><div className="cta-orbit" aria-hidden="true" /><div className="container">
          <span className="eyebrow">{h.ctaeyebrow}</span>
          <h2>{l.closeTitle}<br /><span className="gradient-text">{l.closeAccent}</span></h2>
          <p>{l.closeDescription}</p>
          <ul className="cta-benefits"><li><Check size={13} />{h.re2}</li><li><Check size={13} />{h.re3}</li></ul>
          {SHOW_LANDING_PRICES && pricing.plans.length > 0
            ? <div className="cta-plans">{pricing.plans.map((plan) => (
                <Link key={plan.slug} href={`/cadastro?plano=${plan.slug}`}
                  className={`cta-plan${plan.featured ? " is-featured" : ""}`}>
                  <strong>{plan.name}</strong>
                  {plan.content.description && <span className="cta-plan-desc">{plan.content.description}</span>}
                  <span className="cta-plan-price">
                    {plan.priceCents > 0 && discountPct > 0 &&
                      <s className="cta-plan-was">{loc.isBrazil
                        ? `R$ ${formatPlanPrice(plan.priceCents)}`
                        : formatMoney(planIntlCents(plan, loc.currency) ?? 0, loc.currency, loc.lang)}</s>}
                    {loc.isBrazil
                      ? <>R$ {formatPlanPrice(disc(plan.priceCents))}</>
                      : formatMoney(disc(planIntlCents(plan, loc.currency) ?? 0), loc.currency, loc.lang)}
                    <small>{t.pricing.perMonth}</small>
                  </span>
                  <em>{plan.content.cta} <ArrowUpRight size={13} /></em>
                </Link>
              ))}</div>
            : <Link href="/cadastro" className="button button-primary">{h.ctab} <ArrowUpRight size={17} /></Link>}
          <span className="final-note">{h.ctanote}</span>
          <span className="cta-wordmark" aria-hidden="true">seekerai.</span>
        </div></section>
      </main>
      <footer className="footer"><div className="container"><div className="footer-top"><div><Brand /><p>{h.footSlogan1}<br />{h.footSlogan2}</p></div><div className="footer-links"><a href="#como-funciona">{h.footHow}</a>{(SHOW_LANDING_PRICES ? pricing.plans.length > 0 : true) && <a href="#planos">{h.footPlans}</a>}<Link href="/explorar">{h.footDemo} <ArrowUpRight size={12} /></Link></div><div className="footer-links"><Link href="/termos">{h.footTerms}</Link><Link href="/privacidade">{h.footPrivacy}</Link><Link href="/cadastro">{h.footEarly}</Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} SeekerAi. {h.footCopy}</span><LocaleSwitcher current={loc} /><span><span className="status-dot" />{h.footBuilding}</span></div></div></footer>
      <div className="mobile-sticky-cta"><Link href="/cadastro" className="button button-primary">{l.primaryCta} <ArrowRight size={16} /></Link></div>
    </>
  );
}
