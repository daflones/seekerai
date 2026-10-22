import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, AudioLines, Bookmark, Check, ChevronDown, Code2, Compass, Globe, MapPin, MessageCircle, Mic, MousePointer2, Play, Radar, Search, ShieldCheck, Sparkles, WandSparkles, Zap } from "lucide-react";
import { Brand } from "@/components/brand";
import { Navigation } from "@/components/navigation";
import { Pricing } from "@/components/pricing";
import { ProductDemo } from "@/components/product-demo";
import { publicPlanCards } from "@/lib/plans/server";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { LocaleSwitcher } from "@/components/locale-switcher";

export const dynamic = "force-dynamic";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://seekerai.digital";

export default async function Home() {
  const loc = await getLocale();
  const t = getMessages(loc.lang);
  const h = t.home;
  const pricing = await publicPlanCards();

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
        description: `${h.heroDesc1} ${h.heroDesc2}`,
        offers: { "@type": "Offer", price: "0", priceCurrency: loc.currency.toUpperCase(), description: h.re1 },
      },
      {
        "@type": "FAQPage",
        mainEntity: h.faqs.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navigation t={t.nav} />
      <main id="conteudo">
        <section className="hero">
          <div className="cosmic-grid" aria-hidden="true" /><div className="hero-orbit orbit-one" aria-hidden="true" /><div className="hero-orbit orbit-two" aria-hidden="true" />
          <div className="hero-content container">
            <div className="announcement"><span className="status-dot" /><span>{h.announce}</span><span className="announcement-new">{h.announceTag}</span><ArrowUpRight size={12} /></div>
            <h1>{h.heroA}<br />{h.heroB} <span className="hero-word">{h.heroWord}<svg viewBox="0 0 420 18" fill="none" aria-hidden="true"><path d="M3 13C100 0 296 0 416 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span><span className="hero-period">.</span></h1>
            <p className="hero-description">{h.heroDesc1}<br className="desktop-break" /> {h.heroDesc2}</p>
            <div className="hero-ctas"><Link href="/cadastro" className="button button-primary">{h.cta1} <ArrowUpRight size={17} /></Link><a href="#demonstracao" className="button button-glass"><span className="play-circle"><Play size={10} fill="currentColor" /></span>{h.cta2}</a></div>
            <div className="hero-reassurance"><span><Check size={13} />{h.re1}</span><span><Check size={13} />{h.re2}</span><span><Check size={13} />{h.re3}</span></div>
          </div>
          <div className="hero-product container" id="demonstracao">
            <div className="product-caption"><span><span className="status-dot" /> {h.captionL}</span><span>{h.captionR} <ArrowDown size={12} /></span></div>
            <ProductDemo />
            <div className="floating-insight"><span className="insight-icon"><Sparkles size={17} /></span><div><strong>{h.insightT}</strong><span>{h.insightS}</span></div><span className="insight-check"><Check size={13} /></span></div>
          </div>
          <div className="hero-bottom container"><span>{h.madeFor}</span><div><span><Code2 size={17} />{h.seg1}</span><span><Compass size={17} />{h.seg2}</span><span><WandSparkles size={17} />{h.seg3}</span><span><Zap size={17} />{h.seg4}</span></div></div>
        </section>

        <section id="como-funciona" className="section light-section">
          <div className="container">
            <div className="section-heading split-heading"><div><span className="eyebrow">{h.s2eyebrow}</span><h2>{h.s2titleA}<br />{h.s2titleB}</h2></div><p>{h.s2p}</p></div>
            <div className="steps-grid">
              <article className="step-card"><div className="step-number">01<span /></div><h3>{h.step1t}</h3><p>{h.step1p}</p><div className="mini-map"><div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" /><span className="map-area area-one" /><span className="map-area area-two" /><span className="map-pin pin-one"><MapPin size={17} /></span><span className="map-pin pin-two"><MapPin size={13} /></span><span className="map-pin pin-three"><MapPin size={13} /></span><div className="map-tooltip"><span className="map-icon"><Search size={15} /></span><div><strong>{h.step1next}</strong><small>{h.step1near}</small></div></div><span className="mini-map-label"><span className="status-dot" />{h.step1label}</span></div></article>
              <article className="step-card"><div className="step-number">02<span /></div><h3>{h.step2t}</h3><p>{h.step2p}</p><div className="mini-analysis"><div className="mini-analysis-top"><span className="business-avatar violet">BH</span><div><strong>Barbearia Horizonte</strong><small>{h.step2ex}</small></div><span className="mini-score">96<span>/100</span></span></div><div className="analysis-signals"><span><Globe size={20} /><strong>{h.step2site}</strong><small className="signal-missing">{h.step2missing}</small></span><span><MapPin size={20} /><strong>{h.step2local}</strong><small>{h.step2found}</small></span><span><MessageCircle size={20} /><strong>{h.step2contact}</strong><small>{h.step2verifying}</small></span></div><div className="analysis-recommendation"><Sparkles size={15} /><span>{h.step2rec}</span></div></div></article>
              <article className="step-card"><div className="step-number">03<span /></div><h3>{h.step3t}</h3><p>{h.step3p}</p><div className="mini-chat"><div className="chat-header"><span className="chat-avatar">BH</span><div><strong>Barbearia Horizonte</strong><small>{h.step3chat}</small></div><MessageCircle size={17} /></div><div className="chat-bubble outgoing">{h.step3b1}<small>10:42 <Check size={11} /></small></div><div className="chat-bubble incoming">{h.step3b2}<small>10:43</small></div><div className="chat-input">{h.step3input} <ArrowUpRight size={14} /></div></div></article>
            </div>
          </div>
        </section>

        <section id="recursos" className="section light-section opportunity-section">
          <div className="container feature-split">
            <div className="feature-copy"><span className="eyebrow">{h.feyebrow}</span><h2>{h.ftitleA}<br /><span className="muted-heading">{h.ftitleB}</span></h2><p>{h.fp}</p><ul className="check-list"><li><Check />{h.fli1}</li><li><Check />{h.fli2}</li><li><Check />{h.fli3}</li></ul><Link href="/explorar" className="text-link">{h.flink} <ArrowUpRight size={17} /></Link></div>
            <div className="opportunity-visual"><span className="visual-orbit" /><div className="opportunity-detail"><div className="detail-top"><span><Sparkles size={13} />{h.fdetailEyebrow}</span><span className="detail-sparkle">✧</span></div><h3>{h.fdetailT}</h3><div className="detail-row"><span className="detail-icon"><Globe size={20} /></span><div><small>{h.fdetailRow}</small><strong>{h.fdetailGap}</strong></div><span className="detail-indicator" /></div><div className="detail-offer"><span>{h.fdetailOffer}</span><p>{h.fdetailOfferP}</p></div><div className="detail-footer"><ShieldCheck size={14} />{h.fdetailFoot}</div></div><div className="context-chip"><MousePointer2 size={14} />{h.fdetailChip}</div></div>
          </div>
        </section>

        <section className="section dark-feature-section">
          <div className="container feature-split">
            <div className="site-preview"><div className="site-browser"><span /><span /><span /><small>seu-proximo-projeto.demo</small></div><div className="sample-site"><div className="sample-site-nav">HORIZONTE<span>BARBEARIA & ESTILO</span><span>AGENDAMENTO ↗</span></div><span className="sample-site-eyebrow">SEU ESTILO. SEU TEMPO.</span><h3>Mais que um corte.<br /><em>Seu momento.</em></h3><p>Um novo jeito de cuidar de você.</p><span className="sample-site-button">Reserve seu horário <ArrowUpRight size={12} /></span><div className="barber-art" aria-hidden="true"><span className="barber-arch" /><span className="barber-mirror" /><span className="barber-chair" /></div><div className="sample-site-bottom"><span>FEITO PARA O SEU NEGÓCIO</span><span>01 — 03</span></div></div><div className="generation-pill"><WandSparkles size={15} /><span>Do “e se?” ao “olha isso”.</span><Check size={14} /></div></div>
            <div className="feature-copy"><span className="eyebrow">{h.deyebrow}</span><h2>{h.dtitleA}<br /><span className="gradient-text">{h.dtitleB}</span></h2><p>{h.dp}</p><ul className="check-list"><li><Check />{h.dli1}</li><li><Check />{h.dli2}</li><li><Check />{h.dli3}</li></ul><span className="roadmap-label"><span className="status-dot" />{h.droadmap}</span></div>
          </div>
        </section>

        <section className="section copilot-section">
          <div className="container feature-split">
            <div className="feature-copy"><span className="eyebrow">{h.ceyebrow}</span><h2>{h.ctitleA}<br /><span className="gradient-text">{h.ctitleB}</span></h2><p>{h.cp}</p><div className="copilot-modes"><span><Mic size={14} />{h.cm1}</span><span><MessageCircle size={14} />{h.cm2}</span></div><span className="roadmap-label"><span className="status-dot" />{h.croadmap}</span></div>
            <div className="copilot-window"><div className="copilot-header"><span className="copilot-icon"><AudioLines size={20} /></span><div><strong>{h.ccopT}</strong><small>{h.ccopS}</small></div><span className="example-tag">{h.cpreview}</span></div><div className="audio-wave" aria-hidden="true">{Array.from({ length: 45 }, (_, i) => <i key={i} style={{ height: `${12 + ((i * 17 + 13) % 45)}px`, animationDelay: `${i * 0.04}s` }} />)}</div><div className="transcript"><span>{h.cclient}</span><p>{h.cquote}</p></div><div className="copilot-answer"><span><Sparkles size={13} />{h.canswerT}</span><p>{h.canswer}</p><div><span>{h.ctip}</span><span>↗</span></div></div><div className="copilot-disclaimer"><ShieldCheck size={12} />{h.cdisc}</div></div>
          </div>
        </section>

        <section id="portfolio" className="section light-section portfolio-section">
          <div className="container feature-split"><div className="portfolio-phones"><div className="phone phone-back"><div className="phone-camera" /><div className="portfolio-monogram">DA<span>DESIGN QUE APROXIMA</span></div><h3>Seu trabalho<br />fala por você.</h3><div className="phone-project project-orange" /><div className="phone-project project-green" /></div><div className="phone phone-front"><div className="phone-camera" /><span className="phone-availability"><span className="status-dot" />{h.pavail}</span><div className="phone-avatar">DA<span>✦</span></div><small>SEU PRÓXIMO PARCEIRO CRIATIVO</small><h3>Design com<br />propósito.</h3><p>Marcas e sites que conectam<br />pessoas a bons negócios.</p><span className="phone-cta">Vamos criar juntos <ArrowUpRight size={13} /></span><div className="phone-work"><span>SELEÇÃO DE PROJETOS</span><div /><small>Identidade visual · Projeto de exemplo</small></div></div><span className="portfolio-example">{h.pexample}</span></div><div className="feature-copy"><span className="eyebrow">{h.peyebrow}</span><h2>{h.ptitleA}<br /><span className="muted-heading">{h.ptitleB}</span></h2><p>{h.pp}</p><ul className="check-list"><li><Check />{h.pli1}</li><li><Check />{h.pli2}</li><li><Check />{h.pli3}</li></ul><Link href="/cadastro" className="button button-dark">{h.pcta} <ArrowUpRight size={16} /></Link></div></div>
        </section>

        <section className="section toolkit-section light-section"><div className="container"><div className="section-heading centered"><span className="eyebrow">{h.teyebrow}</span><h2>{h.ttitleA}<br /><span className="muted-heading">{h.ttitleB}</span></h2></div><div className="toolkit-grid">{[{ icon: Search, title: h.tk1t, text: h.tk1p }, { icon: Radar, title: h.tk2t, text: h.tk2p }, { icon: MessageCircle, title: h.tk3t, text: h.tk3p }, { icon: AudioLines, title: h.tk4t, text: h.tk4p }, { icon: Bookmark, title: h.tk5t, text: h.tk5p }, { icon: Globe, title: h.tk6t, text: h.tk6p }].map(({ icon: Icon, title, text }) => <article key={title}><span><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></article>)}</div><p className="roadmap-footnote">{h.tfoot}</p></div></section>

        <div className="container"><Pricing plans={pricing.plans} source={pricing.source} locale={loc} t={t.pricing} /></div>

        <section className="section faq-section light-section"><div className="container faq-layout"><div className="section-heading"><span className="eyebrow">{h.faqeyebrow}</span><h2>{h.faqtitleA}<br />{h.faqtitleB}</h2><p>{h.faqp}</p></div><div className="faq-list">{h.faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</div></div></section>

        <section className="final-cta"><div className="cta-orbit" aria-hidden="true" /><div className="container"><span className="eyebrow">{h.ctaeyebrow}</span><h2>{h.ctatitleA}<br /><span className="gradient-text">{h.ctatitleB}</span></h2><p>{h.ctap}</p><Link href="/cadastro" className="button button-primary">{h.ctab} <ArrowUpRight size={17} /></Link><span className="final-note">{h.ctanote}</span></div></section>
      </main>
      <footer className="footer"><div className="container"><div className="footer-top"><div><Brand /><p>{h.footSlogan1}<br />{h.footSlogan2}</p></div><div className="footer-links"><a href="#como-funciona">{h.footHow}</a><a href="#planos">{h.footPlans}</a><Link href="/explorar">{h.footDemo} <ArrowUpRight size={12} /></Link></div><div className="footer-links"><Link href="/termos">{h.footTerms}</Link><Link href="/privacidade">{h.footPrivacy}</Link><Link href="/cadastro">{h.footEarly}</Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} SeekerAi. {h.footCopy}</span><LocaleSwitcher current={loc} /><span><span className="status-dot" />{h.footBuilding}</span></div></div></footer>
      <div className="mobile-sticky-cta"><Link href="/explorar" className="button button-primary">{h.stickyCta} <ArrowRight size={16} /></Link></div>
    </>
  );
}
