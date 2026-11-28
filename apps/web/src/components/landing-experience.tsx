"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Bot, Check, CheckCheck, CircleCheck, Globe, Link2, MapPin, MessageCircle, Monitor, MousePointer2, Scissors, Search, Sparkles, Sprout, UtensilsCrossed } from "lucide-react";
import type { LandingMessages } from "@/lib/i18n/landing-messages";

type Niche = LandingMessages["sites"]["niches"][number];
const nicheIcons = [Scissors, Sprout, UtensilsCrossed];
const stepIcons = [Search, Monitor, MessageCircle, Bot];

function SiteComposition({ niche, index = 0, compact = false }: { niche: Niche; index?: number; compact?: boolean }) {
  const Icon = nicheIcons[index];
  return <div className={`lp-site-composition lp-niche-${index}${compact ? " is-compact" : ""}`}>
    <div className="lp-site-nav"><strong><Icon size={16} />{niche.brand}</strong><span>{niche.name} <ArrowUpRight size={12} /></span></div>
    <div className="lp-site-body">
      <div className="lp-site-copy"><span className="lp-site-kicker">{niche.name}</span><h3>{niche.headline}</h3><p>{niche.tagline}</p><span className="lp-site-cta">{niche.cta}<ArrowUpRight size={14} /></span></div>
      <div className="lp-site-art" aria-hidden="true"><div className="lp-art-arch" /><div className="lp-art-ring" /><Icon strokeWidth={.75} /><span>0{index + 1}</span></div>
    </div>
    <div className="lp-site-services">{niche.features.map((feature, i) => <div key={feature}><small>0{i + 1}</small><strong>{feature}</strong><ArrowUpRight size={14} /></div>)}</div>
    {!compact && <div className="lp-site-footer"><span>{niche.brand}</span><span>{niche.tagline}</span></div>}
  </div>;
}

function BrowserBar({ label }: { label: string }) {
  return <div className="lp-browser-bar"><span className="lp-browser-dots" aria-hidden="true"><i /><i /><i /></span><span><Globe size={12} />{label}</span><Monitor size={13} /></div>;
}

export function LandingHeroVisual({ t }: { t: LandingMessages }) {
  return <div className="lp-hero-visual">
    <div className="lp-hero-halo" aria-hidden="true" />
    <div className="lp-hero-browser"><BrowserBar label={t.exampleLabel} /><SiteComposition niche={t.sites.niches[0]} compact /></div>
    <div className="lp-ready"><span><CircleCheck size={19} /></span><div><strong>{t.siteReady}</strong><small>{t.linkReady}</small></div><Link2 size={16} /></div>
    <div className="lp-hero-message"><span className="lp-message-icon"><MessageCircle size={19} /></span><div><small>{t.personalized}</small><p>{t.sites.niches[0].message}</p><span><CheckCheck size={15} /> SeekerAi</span></div></div>
  </div>;
}

export function LandingJourney({ t }: { t: LandingMessages }) {
  const [step, setStep] = useState(0);
  const reduced = useReducedMotion();
  const id = useId();
  const Icon = stepIcons[step];
  const current = t.flow.steps[step];
  return <section id="como-funciona" className="lp-section">
    <div className="container">
      <div className="lp-heading"><span className="eyebrow">{t.flow.kicker}</span><h2>{t.flow.title}</h2><p>{t.flow.description}</p></div>
      <div className="lp-journey-steps" role="group" aria-label={t.flow.title}>
        {t.flow.steps.map((item, i) => {
          const StepIcon = stepIcons[i];
          return <button type="button" key={item.title} id={`${id}-step-${i}`} aria-pressed={i === step} aria-controls={`${id}-panel`} onClick={() => setStep(i)}>
            <span className="lp-step-number">0{i + 1}</span><StepIcon size={20} /><strong>{item.title}</strong><ArrowRight size={16} />
          </button>;
        })}
      </div>
      <div className="lp-journey-panel" id={`${id}-panel`} role="region" aria-labelledby={`${id}-step-${step}`}>
        <div className="lp-journey-copy"><span className="lp-big-icon"><Icon size={27} /></span><h3>{current.title}</h3><p>{current.body}</p><strong><Check size={17} />{current.detail}</strong><Link href="/cadastro" className="text-link">{t.primaryCta}<ArrowUpRight size={16} /></Link></div>
        <AnimatePresence initial={false} mode="wait">
          <motion.div key={step} className="lp-journey-scene" initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: reduced ? 1 : 0 }} transition={{ duration: reduced ? 0 : .18 }}>
            <span className="lp-example-label">{t.exampleLabel}</span>
            {step === 0 && <div className="lp-lead-scene">
              <div className="lp-demo-search"><Search size={16} /><span>{t.sites.niches[0].name}</span><MapPin size={15} /></div>
              {t.sites.niches.map((niche, i) => <div className={`lp-demo-lead${i === 0 ? " is-selected" : ""}`} key={niche.brand}>
                <span>{niche.brand.slice(0, 2)}</span><div><strong>{niche.brand}</strong><small>{niche.name}</small></div><ArrowUpRight size={17} />
              </div>)}
            </div>}
            {step === 1 && <div className="lp-flow-site"><SiteComposition niche={t.sites.niches[0]} compact /><div className="lp-flow-confirm"><CircleCheck size={17} />{t.siteReady}</div></div>}
            {step === 2 && <div className="lp-outreach-scene"><span><Sparkles size={17} />{t.personalized}</span><p>{t.sites.niches[0].message}</p><div><Link2 size={16} />{t.linkReady}<ArrowUpRight size={15} /></div></div>}
            {step === 3 && <div className="lp-chat-scene"><div className="lp-chat-question">{t.copilot.examples[0].prompt}</div><div className="lp-chat-answer"><Bot size={21} /><p>{t.copilot.examples[0].answer}</p></div></div>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  </section>;
}

export function LandingNiches({ t }: { t: LandingMessages }) {
  const [selected, setSelected] = useState(0);
  const niche = t.sites.niches[selected];
  return <>
    <section id="sites-ia" className="lp-section lp-sites-section">
      <div className="container">
        <div className="lp-heading"><span className="eyebrow">{t.sites.kicker}</span><h2>{t.sites.title}</h2><p>{t.sites.description}</p></div>
        <div className="lp-niche-controls" role="group" aria-label={t.sites.select}>
          {t.sites.niches.map((item, i) => {
            const Icon = nicheIcons[i];
            return <button key={item.name} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><Icon size={17} />{item.name}</button>;
          })}
        </div>
        <div className="lp-niche-layout">
          <div className="lp-niche-browser"><BrowserBar label={t.exampleLabel} /><div key={selected} className="lp-niche-transition"><SiteComposition niche={niche} index={selected} /></div></div>
          <div className="lp-niche-details"><span className="lp-big-icon"><Sparkles size={25} /></span><h3>{t.sites.features}</h3><ul>{niche.features.map((feature) => <li key={feature}><CircleCheck size={17} />{feature}</li>)}</ul><p>{t.sites.note}</p><Link href="/cadastro" className="button button-primary">{t.primaryCta}<ArrowUpRight size={16} /></Link></div>
        </div>
      </div>
    </section>
    <section id="abordagens" className="lp-section">
      <div className="container lp-split">
        <div className="lp-heading"><span className="eyebrow">{t.outreach.kicker}</span><h2>{t.outreach.title}</h2><p>{t.outreach.description}</p><ul className="lp-benefits">{t.outreach.points.map((point) => <li key={point}><Check size={18} />{point}</li>)}</ul></div>
        <div className="lp-message-comparison">
          <div className="lp-generic-message"><small>{t.outreach.genericLabel}</small><p>{t.outreach.generic}</p></div>
          <div className="lp-personal-message"><div className="lp-personal-head"><span><Sparkles size={17} />{t.outreach.personalLabel}</span><span>{niche.name}</span></div><p>{niche.message}</p><div className="lp-message-attachment"><Globe size={22} /><div><strong>{niche.brand}</strong><small>{t.linkReady}</small></div><ArrowUpRight size={16} /></div></div>
          <p className="lp-small-note">{t.outreach.note}</p>
        </div>
      </div>
    </section>
  </>;
}

export function LandingCopilot({ t }: { t: LandingMessages }) {
  const [selected, setSelected] = useState(0);
  const current = t.copilot.examples[selected];
  return <section id="copiloto" className="lp-section lp-copilot-section">
    <div className="container lp-split">
      <div className="lp-heading"><span className="eyebrow">{t.copilot.kicker}</span><h2>{t.copilot.title}</h2><p>{t.copilot.description}</p>
        <div className="lp-copilot-prompts" role="group" aria-label={t.copilot.choose}>{t.copilot.examples.map((example, i) => <button key={example.prompt} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><MessageCircle size={17} />{example.prompt}<ArrowRight size={16} /></button>)}</div>
      </div>
      <div className="lp-copilot-window">
        <header><span className="lp-big-icon"><Bot size={25} /></span><div><strong>{t.copilot.assistant}</strong><small>{t.exampleLabel}</small></div><span className="status-dot" /></header>
        <div className="lp-copilot-context"><span>{t.copilot.context}</span><strong>{t.sites.niches[0].brand}</strong><small><Globe size={13} />{t.siteReady}</small></div>
        <div className="lp-copilot-conversation" aria-live="polite" aria-atomic="true"><div className="lp-chat-question">{current.prompt}</div><div className="lp-chat-answer"><Sparkles size={20} /><p>{current.answer}</p></div></div>
        <footer><MousePointer2 size={14} /><span>{t.copilot.note}</span></footer>
      </div>
    </div>
  </section>;
}
