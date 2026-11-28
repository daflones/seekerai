"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import useEmblaCarousel from "embla-carousel-react";
import { useInView, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight, Expand, Film, Globe, Monitor, MousePointer2, Play, Smartphone, X } from "lucide-react";
import type { LandingMessages } from "@/lib/i18n/landing-messages";
import type { ShowcaseSite, VideoSource } from "@/lib/landing-content";

function SiteFrame({ site, t }: { site: ShowcaseSite; t: LandingMessages["gallery"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: .2, margin: "100px 0px" });
  const [active, setActive] = useState(false);
  return <div className={`lp-live-frame${active ? " is-active" : ""}`} ref={ref}>
    {seen || active ? <><iframe src={`/site/${site.slug}`} title={site.name} loading="lazy" referrerPolicy="no-referrer"
      sandbox="allow-scripts" tabIndex={active ? 0 : -1} />
      {!active && <button className="lp-activate-site" type="button" onClick={() => setActive(true)}><MousePointer2 size={15} />{t.preview}</button>}
    </> : <button type="button" className="lp-load-site" onClick={() => setActive(true)}>
      <Globe size={34} strokeWidth={1} /><strong>{site.name}</strong><span><MousePointer2 size={15} />{t.load}</span>
    </button>}
  </div>;
}

export function LandingShowcase({ sites, t }: { sites: ShowcaseSite[]; t: LandingMessages["gallery"] }) {
  const reduced = useReducedMotion();
  const [viewport, api] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", duration: reduced ? 0 : 25 });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (!api) return;
    const update = () => { setCanPrev(api.canScrollPrev()); setCanNext(api.canScrollNext()); };
    update();
    api.on("select", update).on("reInit", update);
    return () => { api.off("select", update).off("reInit", update); };
  }, [api]);
  if (!sites.length) return null;
  return <section className="lp-section lp-showcase" id="sites-reais">
    <div className="container">
      <div className="lp-gallery-heading"><div className="lp-heading"><span className="eyebrow">{t.kicker}</span><h2>{t.title}</h2><p>{t.description}</p></div>
        <div className="lp-gallery-controls"><button type="button" aria-label={t.previous} disabled={!canPrev} onClick={() => api?.scrollPrev()}><ArrowLeft size={20} /></button><button type="button" aria-label={t.next} disabled={!canNext} onClick={() => api?.scrollNext()}><ArrowRight size={20} /></button></div>
      </div>
      <div className="lp-gallery-viewport" ref={viewport}>
        <div className="lp-gallery-track">
          {sites.map((site, index) => <article key={site.slug} className="lp-gallery-slide">
            <div className="lp-gallery-card">
              <div className="lp-browser-bar"><span className="lp-browser-dots" aria-hidden="true"><i /><i /><i /></span><span>{t.live}</span><small>0{index + 1}</small></div>
              <SiteFrame site={site} t={t} />
              <div className="lp-gallery-caption"><div><h3>{site.name}</h3><small>{t.original}</small></div><a href={`/site/${site.slug}`} target="_blank" rel="noopener noreferrer" aria-label={`${t.open}: ${site.name}`}><ArrowUpRight size={21} /></a></div>
              <Dialog.Root onOpenChange={() => setMobile(false)}>
                <Dialog.Trigger asChild><button type="button" className="lp-preview-open"><Expand size={15} />{t.preview}</button></Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="lp-preview-overlay" />
                  <Dialog.Content className="lp-preview-dialog">
                    <header><div><Dialog.Title>{site.name}</Dialog.Title><Dialog.Description>{t.scroll}</Dialog.Description></div><Dialog.Close asChild><button type="button" aria-label={t.close}><X size={20} /></button></Dialog.Close></header>
                    <div className="lp-preview-toolbar"><div role="group" aria-label={t.preview}><button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={16} />{t.desktop}</button><button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={16} />{t.mobile}</button></div><a href={`/site/${site.slug}`} target="_blank" rel="noopener noreferrer">{t.open}<ArrowUpRight size={15} /></a></div>
                    <div className={`lp-expanded-site${mobile ? " is-mobile" : ""}`}><iframe src={`/site/${site.slug}`} title={`${t.preview}: ${site.name}`} sandbox="allow-scripts" referrerPolicy="no-referrer" /></div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </article>)}
        </div>
      </div>
    </div>
  </section>;
}

export function LandingVideo({ source, t }: { source: VideoSource; t: LandingMessages["video"] }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  return <section className="lp-section lp-video-section" id="video-demo">
    <div className="container">
      <div className="lp-heading centered"><span className="eyebrow">{t.kicker}</span><h2>{t.title}</h2><p>{t.description}</p></div>
      <div className="lp-video-player">
        {!playing ? <button type="button" className="lp-video-cover" onClick={() => setPlaying(true)}>
          <span className="lp-video-grid" aria-hidden="true" /><span className="lp-video-brand"><Film size={20} />SeekerAi</span><span className="lp-play-button"><Play size={28} fill="currentColor" /></span><strong>{t.play}</strong><small>{t.note}</small>
        </button> : source.kind === "embed"
          ? <iframe src={source.src} title={t.title} allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          : <video src={source.src} controls playsInline preload="metadata" aria-label={t.title} onError={() => setFailed(true)} />}
      </div>
      {playing && <p className="lp-small-note">{failed && `${t.error} `}<a href={source.src} target="_blank" rel="noopener noreferrer">{t.open}<ArrowUpRight size={14} /></a></p>}
    </div>
  </section>;
}
