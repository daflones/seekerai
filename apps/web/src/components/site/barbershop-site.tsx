"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence, motion, useReducedMotion, useScroll,
} from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import {
  ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Clock,
  Instagram, MapPin, Menu, MessageCircle, Phone, Scissors, Sparkles, X,
} from "lucide-react";
import type { SiteConfig } from "@/lib/sites";
import { ImageStreamHero } from "./image-stream-hero";
import {
  CountUp, EASE, FadeUp, Magnetic, RevealText, Spotlight,
  useBooking, useOverlayLock, VideoCard,
} from "./primitives";
import { siteLocale, siteMoney, siteStrings } from "./site-i18n";
import "./site.css";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export function BarbershopSite({ slug, config }: { slug: string; config: SiteConfig }) {
  const cfg = config;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const {
    bookOpen, setBookOpen, step, bk, setBk, erro, waNumber,
    pros, hasPros, dias, slots, stepsTotal, dataStep, horaStep, finalStep,
    openBook, next, back, dataLabel,
  } = useBooking(config);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const heroImgRef = useRef<HTMLImageElement>(null);
  const giantRef = useRef<HTMLDivElement>(null);
  const footBodyRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();

  const marca = cfg.marca || cfg.nome;
  const galeria = cfg.fotos.galeria;
  const videosAll = cfg.videos ?? [];
  const destaqueVideo = videosAll.find((v) => v.destaque) ?? videosAll[0] ?? null;
  const outrosVideos = videosAll.filter((v) => v !== destaqueVideo);

  // ---------- Lenis smooth scroll + ScrollTrigger ----------
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); lenisRef.current = null; };
  }, [reduced]);

  const scrollTo = useCallback((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el as HTMLElement, { offset: -70 });
    else el.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ---------- efeitos GSAP: parallax do hero + footer cinematográfico ----------
  useEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      // parallax da foto do hero (a imagem "anda" mais devagar que o scroll)
      if (heroImgRef.current) {
        gsap.fromTo(heroImgRef.current, { yPercent: -8, scale: 1.12 }, {
          yPercent: 8, ease: "none",
          scrollTrigger: { trigger: ".bshop-hero", start: "top top", end: "bottom top", scrub: true },
        });
      }
      // giant text do footer sobe conforme a cortina abre (ref: motion-footer)
      gsap.fromTo(giantRef.current, { y: "12vh", scale: 0.85, opacity: 0 }, {
        y: "0vh", scale: 1, opacity: 1, ease: "power1.out",
        scrollTrigger: { trigger: ".bshop-footer-wrap", start: "top 80%", end: "bottom bottom", scrub: 1 },
      });
      gsap.fromTo(footBodyRef.current, { y: 50, opacity: 0 }, {
        y: 0, opacity: 1, ease: "power3.out",
        scrollTrigger: { trigger: ".bshop-footer-wrap", start: "top 45%", end: "bottom bottom", scrub: 1 },
      });
    }, rootRef);
    return () => ctx.revert();
  }, [reduced]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ---------- scroll-lock + Escape para lightbox e modal de agendamento ----------
  useOverlayLock(lightbox !== null || bookOpen, {
    onEscape: () => { setLightbox(null); setBookOpen(false); },
    lightbox: { index: lightbox, total: galeria.length, go: setLightbox },
  });

  const S = siteStrings(cfg.lang);
  const dows = S.dows;
  const money = siteMoney(cfg.lang);
  const fmtDia = new Intl.DateTimeFormat(siteLocale(cfg.lang), { day: "numeric", month: "short" });

  const marqueeItems = [
    ...(cfg.servicos ?? []).map((s) => s.nome),
    cfg.tagline ?? "", S.marqueeBarber, marca,
  ].filter(Boolean);

  const anchor = (href: string) => (e: React.MouseEvent) => { e.preventDefault(); setMenuOpen(false); scrollTo(href); };

  return (
    <div className="bshop" ref={rootRef}>
      <div className="bshop-ambient" aria-hidden><i className="orb-a" /><i className="orb-b" /><i className="orb-c" /></div>
      <div className="bshop-grain" aria-hidden />
      <motion.div className="bshop-progress" style={{ scaleX: scrollYProgress }} aria-hidden />
      {cfg.seo && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org", "@type": "Barbershop",
            name: cfg.nome, address: cfg.contato.endereco, telephone: cfg.contato.telefone,
            url: `https://seekerai.digital/site/${slug}`,
            ...(cfg.avaliacoes ? { aggregateRating: { "@type": "AggregateRating", ratingValue: cfg.avaliacoes.nota, reviewCount: cfg.avaliacoes.total } } : {}),
          }),
        }} />
      )}

      {/* ---------- NAV ---------- */}
      <nav className={`bshop-nav${scrolled ? " is-scrolled" : ""}`}>
        <a className="bshop-logo" href="#top" onClick={anchor("#top")} aria-label={cfg.nome}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cfg.logo ? <img className="bshop-logo-img" src={cfg.logo} alt="" /> : <span className="bshop-logo-mark">{marca[0]}</span>}
          {marca.toUpperCase()}
        </a>
        <div className="bshop-nav-links">
          {cfg.historia && <a href="#historia" onClick={anchor("#historia")}>{S.navHistoria}</a>}
          <a href="#galeria" onClick={anchor("#galeria")}>{S.navGaleria}</a>
          <a href="#servicos" onClick={anchor("#servicos")}>{S.navServicos}</a>
          <a href="#contato" onClick={anchor("#contato")}>{S.navContato}</a>
          <button className="bshop-nav-cta" onClick={() => openBook()}>{S.ctaAgendarHorario}</button>
        </div>
        <button className="bshop-nav-burger" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      <AnimatePresence>
        {menuOpen && (
          <motion.div className="bshop-mobile-menu"
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: EASE }}>
            {cfg.historia && <a href="#historia" onClick={anchor("#historia")}>{S.navHistoria}</a>}
            <a href="#galeria" onClick={anchor("#galeria")}>{S.navGaleria}</a>
            <a href="#servicos" onClick={anchor("#servicos")}>{S.navServicos}</a>
            <a href="#contato" onClick={anchor("#contato")}>{S.navContato}</a>
            <button className="bshop-mobile-cta" onClick={() => { setMenuOpen(false); openBook(); }}>{S.ctaAgendarHorario}</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- HERO ---------- */}
      <header className="bshop-hero" id="top">
        <div className="bshop-hero-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cfg.fotos.hero && <img ref={heroImgRef} src={cfg.fotos.hero} alt={`${cfg.nome} — ${S.heroAlt}`} />}
        </div>
        <div className="bshop-hero-content bshop-wrap">
          <div className="bshop-hero-main">
          <motion.span className="bshop-eyebrow"
            initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}>
            {cfg.cidade ?? S.cidadeFb}
          </motion.span>
          <h1>
            <RevealText text={marca.toUpperCase()} delay={0.2} />
            {cfg.tagline && <span className="h1-sub"><RevealText text={cfg.tagline} delay={0.55} /></span>}
          </h1>
          <div className="bshop-hero-bottom">
            <motion.div
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7, ease: EASE }}>
              {cfg.avaliacoes && (
                <span className="bshop-rating-chip">
                  <span className="stars">★★★★★</span>
                  {cfg.avaliacoes.nota.toFixed(1)} · {S.reviewsTotal(cfg.avaliacoes.total, cfg.avaliacoes.fonte)}
                </span>
              )}
              <p className="bshop-hero-desc">{S.heroDesc}</p>
            </motion.div>
            <motion.div className="bshop-hero-actions"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.9, ease: EASE }}>
              <a className="bshop-scroll-hint" href="#historia" onClick={anchor("#historia")}>
                <span className="bshop-shader-text">{S.scrollHistoria}</span>
                <span className="bshop-scroll-hint-line" aria-hidden />
              </a>
            </motion.div>
          </div>
          </div>

          {/* Foto emoldurada — a equipe inteira, sem crop (fundo vira ambiência) */}
          {cfg.fotos.hero && (
            <motion.figure className="bshop-hero-photo"
              initial={{ opacity: 0, y: 40, rotate: 2.5, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
              transition={{ duration: 1.1, delay: 0.45, ease: EASE }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cfg.fotos.hero} alt={S.equipeAlt(cfg.nome)} />
              <figcaption className="bshop-hero-photo-cap">
                {cfg.avaliacoes && <span className="stars">★★★★★ {cfg.avaliacoes.nota.toFixed(1)}</span>}
                <span>{S.equipeCap} · {cfg.cidade ?? cfg.nome}</span>
              </figcaption>
            </motion.figure>
          )}
        </div>
        <motion.div className="bshop-hero-scroll" aria-hidden
          animate={reduced ? {} : { y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
          <span />
        </motion.div>
      </header>

      {/* ---------- MARQUEE ---------- */}
      <div className="bshop-marquee" aria-hidden>
        <div className="bshop-marquee-track">
          {[0, 1].map((k) => (
            <span key={k} style={{ display: "flex", gap: 44 }}>
              {marqueeItems.map((m, i) => (
                <span key={i} style={{ display: "flex", gap: 44 }}>
                  <span>{m}</span><span className="sep">✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- HISTÓRIA + VÍDEO EM DESTAQUE + REELS ---------- */}
      {(cfg.historia || (cfg.videos?.length ?? 0) > 0) && (
        <section className="bshop-section" id="historia">
          <div className="bshop-wrap">
            <div className="bshop-story">
              <div className="bshop-story-text">
                <div className="bshop-section-head">
                  <FadeUp y={16}><span className="bshop-eyebrow">{S.nossaHistoria}</span></FadeUp>
                  <h2 className="bshop-h2"><RevealText text={cfg.historia?.titulo ?? S.deOndeViemos} /></h2>
                </div>
                {(cfg.historia?.paragrafos ?? []).map((p, i) => (
                  <FadeUp key={i} delay={i * 0.08}><p dangerouslySetInnerHTML={{ __html: p }} /></FadeUp>
                ))}
              </div>
              {destaqueVideo && (
                <FadeUp delay={0.15} className="bshop-story-feature">
                  <VideoCard v={destaqueVideo} tall />
                </FadeUp>
              )}
            </div>
            {outrosVideos.length > 0 && (
              <div className="bshop-reels-wrap">
                <FadeUp y={14}><span className="bshop-eyebrow bshop-eyebrow-solo">{S.reelsEyebrow}</span></FadeUp>
                <div className="bshop-reels">
                  {outrosVideos.map((v, i) => (
                    <motion.div key={i} className="bshop-reel"
                      initial={reduced ? false : { opacity: 0, x: 40 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.55, delay: i * 0.07, ease: EASE }}>
                      <VideoCard v={v} reel />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- CORREDOR 3D (image-stream-hero do 21st.dev, adaptado) ---------- */}
      {galeria.length > 0 && (
        <section className="bshop-corridor" aria-label={S.corridorBarberEyebrow}>
          <ImageStreamHero
            images={galeria.map((src, i) => ({ src, alt: `${cfg.nome} — foto ${i + 1}` }))}
            cards={9}
            speed={22}
            className="bshop-corridor-stream">
            <div className="bshop-corridor-overlay">
              <FadeUp><span className="bshop-eyebrow">{S.corridorBarberEyebrow}</span></FadeUp>
              <h2 className="bshop-corridor-title">
                <RevealText text={S.corridorBarberA} /> <em><RevealText text={S.corridorBarberB} delay={0.3} /></em>
              </h2>
            </div>
          </ImageStreamHero>
        </section>
      )}

      {/* ---------- GALERIA (masonry-lightbox adaptado: @ayushmxxn) ---------- */}
      {galeria.length > 0 && (
        <section className="bshop-section" id="galeria" style={{ paddingTop: 0 }}>
          <div className="bshop-wrap">
            <div className="bshop-section-head">
              <FadeUp y={16}><span className="bshop-eyebrow">{S.galeriaEyebrow}</span></FadeUp>
              <h2 className="bshop-h2"><RevealText text={S.porDentroA} /> <em><RevealText text={marca} delay={0.25} /></em></h2>
            </div>
            <div className="bshop-gallery">
              {galeria.map((src, i) => (
                <motion.button key={i} type="button" className="bshop-gallery-item"
                  onClick={() => setLightbox(i)}
                  initial={reduced ? false : { opacity: 0, y: 20, filter: "blur(6px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.6, delay: (i % 9) * 0.05, ease: EASE }}
                  whileHover={reduced ? undefined : { y: -4 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${cfg.nome} — foto ${i + 1}`} loading="lazy" />
                  <span className="bshop-gallery-cap">
                    <span>{cfg.nome}</span><small>{S.fotoCap(i + 1)}</small>
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- SERVIÇOS (vitrine — agendar só no fim, via modal) ---------- */}
      <section className="bshop-section" id="servicos">
        <div className="bshop-wrap">
          <div className="bshop-section-head">
            <FadeUp y={16}><span className="bshop-eyebrow">{S.servicosEyebrow}</span></FadeUp>
            <h2 className="bshop-h2">
              <RevealText text={S.oQueFazemosA} /> <em><RevealText text={S.deMelhorB} delay={0.25} /></em>
            </h2>
          </div>
          <div className="bshop-services">
            {(cfg.servicos ?? []).map((s, i) => (
              <motion.article key={s.nome} className="bshop-service-wrap"
                initial={{ opacity: 0, y: 30, filter: "blur(6px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-8% 0px" }}
                transition={{ duration: 0.6, delay: (i % 6) * 0.07, ease: EASE }}>
                <Spotlight className="bshop-service">
                  <span className="bshop-service-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{s.nome}</h3>
                  <div className="bshop-service-meta">
                    {s.duracaoMin && <span><Clock size={11} style={{ verticalAlign: -1 }} /> ~{s.duracaoMin} min</span>}
                  </div>
                  <div className="bshop-service-price">
                    {s.preco ? <strong>{money.format(s.preco)}</strong> : <span className="ask">{S.valorBalcao}</span>}
                  </div>
                </Spotlight>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- DIFERENCIAIS ---------- */}
      {(cfg.diferenciais?.length ?? 0) > 0 && (
        <section className="bshop-section" style={{ paddingTop: 0 }}>
          <div className="bshop-wrap">
            <div className="bshop-section-head">
              <FadeUp y={16}><span className="bshop-eyebrow">{S.experienciaEyebrow}</span></FadeUp>
              <h2 className="bshop-h2"><RevealText text={S.cadaDetalheA} /> <em><RevealText text={S.contaB} delay={0.25} /></em></h2>
            </div>
            <div className="bshop-perks">
              {(cfg.diferenciais ?? []).map((d, i) => (
                <motion.span key={d} className="bshop-perk"
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.06, ease: EASE }}>
                  <Sparkles size={14} />{d}
                </motion.span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- AVALIAÇÕES ---------- */}
      {cfg.avaliacoes && (
        <section className="bshop-section">
          <div className="bshop-wrap">
            <FadeUp>
              <div className="bshop-rating-hero">
                <div className="big"><CountUp to={cfg.avaliacoes.nota} /></div>
                <div className="stars">★★★★★</div>
                <small>{S.reviewsReal(cfg.avaliacoes.total, cfg.avaliacoes.fonte)}</small>
              </div>
            </FadeUp>
            {(cfg.avaliacoes.itens?.length ?? 0) > 0 && (
              <div className="bshop-reviews">
                {(cfg.avaliacoes.itens ?? []).map((r, i) => (
                  <motion.article key={i} className="bshop-review"
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-8% 0px" }}
                    transition={{ duration: 0.6, delay: (i % 4) * 0.08, ease: EASE }}>
                    <span className="stars">{"★".repeat(r.nota ?? 5)}</span>
                    <p>“{r.texto}”</p>
                    <footer><span>{r.autor}</span>{r.quando && <span>{r.quando}</span>}</footer>
                  </motion.article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- AGENDAMENTO → modal (a reserva é o final da narrativa) ---------- */}

      {/* ---------- LOCALIZAÇÃO ---------- */}
      <section className="bshop-section" id="contato">
        <div className="bshop-wrap">
          <div className="bshop-section-head">
            <FadeUp y={16}><span className="bshop-eyebrow">{S.ondeEstamos}</span></FadeUp>
            <h2 className="bshop-h2"><RevealText text={S.passaAquiA} /> <em><RevealText text={S.esperamosB} delay={0.25} /></em></h2>
          </div>
          <div className="bshop-contact">
            <FadeUp delay={0}>
              <Spotlight className="bshop-contact-card">
                <h3><MapPin size={17} /> {S.endereco}</h3>
                <p>{cfg.contato.endereco}</p>
                {cfg.contato.mapsUrl && (
                  <div className="bshop-contact-links">
                    <a href={cfg.contato.mapsUrl} target="_blank" rel="noopener">{S.abrirMaps} <ArrowRight size={13} /></a>
                  </div>
                )}
              </Spotlight>
            </FadeUp>
            {(cfg.horariosLabel?.length ?? 0) > 0 && (
              <FadeUp delay={0.1}>
                <Spotlight className="bshop-contact-card">
                  <h3><CalendarDays size={17} /> {S.horarios}</h3>
                  {(cfg.horariosLabel ?? []).map(([d, h]) => (
                    <div key={d} className="hours-line"><span>{d}</span><strong>{h}</strong></div>
                  ))}
                </Spotlight>
              </FadeUp>
            )}
            <FadeUp delay={0.2}>
              <Spotlight className="bshop-contact-card">
                <h3><Phone size={17} /> {S.contato}</h3>
                {cfg.contato.telefone && <p>{cfg.contato.telefone}</p>}
                <div className="bshop-contact-links">
                  {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener"><MessageCircle size={14} /> {S.chamarWa}</a>}
                  {cfg.contato.instagram && <a href={`https://instagram.com/${cfg.contato.instagram}`} target="_blank" rel="noopener"><Instagram size={14} /> @{cfg.contato.instagram}</a>}
                  {cfg.contato.telefone && <a href={`tel:${cfg.contato.telefone.replace(/\D/g, "")}`}><Phone size={14} /> {S.ligar}</a>}
                </div>
              </Spotlight>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      {(cfg.faq?.length ?? 0) > 0 && (
        <section className="bshop-section" style={{ paddingTop: 0 }}>
          <div className="bshop-wrap">
            <div className="bshop-section-head">
              <FadeUp y={16}><span className="bshop-eyebrow">{S.duvidas}</span></FadeUp>
              <h2 className="bshop-h2"><RevealText text={S.faqA} /> <em><RevealText text={S.faqB} delay={0.25} /></em></h2>
            </div>
            <FadeUp>
              <div className="bshop-faq">
                {(cfg.faq ?? []).map((f, i) => (
                  <div key={i} className={`bshop-faq-item${faqOpen === i ? " open" : ""}`}>
                    <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} aria-expanded={faqOpen === i}>
                      {f.q}<span className="faq-icon">+</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {faqOpen === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.35, ease: EASE }}
                          style={{ overflow: "hidden" }}>
                          <p>{f.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </FadeUp>
          </div>
        </section>
      )}

      {/* ---------- FOOTER CINEMATOGRÁFICO — port de 21st.dev/@jahed/motion-footer ---------- */}
      <div className="bshop-footer-wrap" style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" }}>
        <footer className="bshop-footer">
          <div className="bshop-footer-aurora" aria-hidden />
          <div className="bshop-footer-grid" aria-hidden />
          <div className="bshop-footer-giant" ref={giantRef} aria-hidden>{marca.toUpperCase()}</div>

          <div className="bshop-footer-marquee" aria-hidden>
            <div className="bshop-marquee-track">
              {[0, 1].map((k) => (
                <span key={k} style={{ display: "flex", gap: 44 }}>
                  {marqueeItems.map((m, i) => (
                    <span key={i} style={{ display: "flex", gap: 44 }}>
                      <span>{m}</span><span className="sep">✦</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>

          <div className="bshop-footer-body" ref={footBodyRef}>
            <h2 className="bshop-footer-h2">{S.footerBarberA}<br /><em>{S.footerBarberB}</em></h2>
            <div className="bshop-footer-pills">
              <Magnetic><button className="bshop-pill primary" onClick={() => openBook()}><Scissors size={15} /> {S.agendarAgora}</button></Magnetic>
              {waNumber && <Magnetic><a className="bshop-pill" href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener"><MessageCircle size={15} /> WhatsApp</a></Magnetic>}
              {cfg.contato.mapsUrl && <Magnetic><a className="bshop-pill" href={cfg.contato.mapsUrl} target="_blank" rel="noopener"><MapPin size={15} /> {S.comoChegar}</a></Magnetic>}
              {cfg.contato.instagram && <Magnetic><a className="bshop-pill" href={`https://instagram.com/${cfg.contato.instagram}`} target="_blank" rel="noopener"><Instagram size={15} /> Instagram</a></Magnetic>}
            </div>
          </div>

          <div className="bshop-footer-bar">
            <small>© {new Date().getFullYear()} {cfg.nome} · {S.direitos}</small>
            <div className="bshop-pill bshop-footer-craft">
              <small>{S.feitoCom}</small><span className="bshop-heart">♥</span><small>{S.por}</small><strong>SeekerAi</strong>
            </div>
            <Magnetic>
              <button className="bshop-pill bshop-footer-top" aria-label={S.voltarTopo}
                onClick={() => (lenisRef.current ? lenisRef.current.scrollTo(0) : window.scrollTo({ top: 0, behavior: "smooth" }))}>
                <ArrowUp size={17} />
              </button>
            </Magnetic>
          </div>
        </footer>
      </div>

      {/* ---------- WhatsApp flutuante ---------- */}
      {waNumber && (
        <a className="bshop-wa-float" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(S.waBarberFloat(cfg.nome))}`}
          target="_blank" rel="noopener" aria-label={S.chamarWa}>
          <MessageCircle size={26} />
        </a>
      )}

      {/* ---------- Modal de agendamento (mesmo fluxo, estilo pills do footer) ---------- */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {bookOpen && (
            <motion.div className="bshop-book-modal-bg"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setBookOpen(false)}>
              <motion.div className="bshop-booking-card bshop-book-modal"
                initial={{ opacity: 0, y: 42, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                onClick={(e) => e.stopPropagation()}>
                <button className="bshop-modal-close" aria-label={S.fechar} onClick={() => setBookOpen(false)}><X size={17} /></button>
                <div className="bshop-book-modal-head">
                  <span className="bshop-eyebrow">{S.agendamento}</span>
                  <h2 className="bshop-modal-h2">{S.reserveBarberA} <em>{S.reserveBarberB}</em></h2>
                </div>
                <div className="bshop-steps">{Array.from({ length: stepsTotal }).map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>

                <AnimatePresence mode="wait">
                  <motion.div key={step}
                    initial={{ opacity: 0, x: reduced ? 0 : 26 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: reduced ? 0 : -26 }}
                    transition={{ duration: 0.3, ease: EASE }}>

                    {step === 0 && (
                      <>
                        <h3 className="bshop-step-title">{S.stepServico}</h3>
                        <div className="bshop-pick-grid">
                          {cfg.servicos.map((s) => (
                            <button key={s.nome} className={`bshop-pick${bk.servico?.nome === s.nome ? " on" : ""}`}
                              onClick={() => setBk((b) => ({ ...b, servico: s, hora: null }))}>
                              <strong>{s.nome}</strong>
                              <small>{s.duracaoMin ? `~${s.duracaoMin} min` : ""}{s.preco ? ` · ${money.format(s.preco)}` : ""}</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {hasPros && step === 1 && (
                      <>
                        <h3 className="bshop-step-title">{S.stepProfBarber}</h3>
                        <div className="bshop-pick-grid">
                          <button className={`bshop-pick${bk.profissional === S.semPref ? " on" : ""}`}
                            onClick={() => setBk((b) => ({ ...b, profissional: S.semPref }))}>
                            <strong>{S.semPref}</strong><small>{S.primeiroDisp}</small>
                          </button>
                          {pros.map((p) => (
                            <button key={p.nome} className={`bshop-pick${bk.profissional === p.nome ? " on" : ""}`}
                              onClick={() => setBk((b) => ({ ...b, profissional: p.nome }))}>
                              <strong>{p.nome}</strong><small>{p.especialidade ?? S.barbeiro}</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {step === dataStep && (
                      <>
                        <h3 className="bshop-step-title">{hasPros ? "3" : "2"}. {S.stepData}</h3>
                        <div className="bshop-days">
                          {dias.map(({ d, aberto }) => (
                            <button key={d.toISOString()} disabled={!aberto}
                              className={`bshop-day${bk.data?.toDateString() === d.toDateString() ? " on" : ""}${aberto ? "" : " off"}`}
                              onClick={() => aberto && setBk((b) => ({ ...b, data: d, hora: null }))}>
                              <div className="dow">{dows[d.getDay()]}</div>
                              <div className="num">{d.getDate()}</div>
                              <div className="mon">{fmtDia.format(d).split(" ")[2] ?? ""}</div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {step === horaStep && (
                      <>
                        <h3 className="bshop-step-title">{hasPros ? "4" : "3"}. {S.stepHora}</h3>
                        {slots.length === 0
                          ? <p className="bshop-book-error">{S.semHorarios}</p>
                          : <div className="bshop-slots">
                              {slots.map((h) => (
                                <button key={h} className={`bshop-slot${bk.hora === h ? " on" : ""}`}
                                  onClick={() => setBk((b) => ({ ...b, hora: h }))}>{h}</button>
                              ))}
                            </div>}
                      </>
                    )}

                    {step === finalStep && (
                      <>
                        <h3 className="bshop-step-title">{hasPros ? "5" : "4"}. {S.stepConfirma}</h3>
                        <dl className="bshop-summary">
                          <div><dt>{S.sumServico}</dt><dd>{bk.servico?.nome}{bk.servico?.preco ? ` — ${money.format(bk.servico.preco)}` : ""}</dd></div>
                          {bk.profissional && bk.profissional !== S.semPref && <div><dt>{S.sumProf}</dt><dd>{bk.profissional}</dd></div>}
                          <div><dt>{S.sumData}</dt><dd>{dataLabel}</dd></div>
                          <div><dt>{S.sumHora}</dt><dd>{bk.hora}</dd></div>
                        </dl>
                        <div className="bshop-field">
                          <label htmlFor="bk-nome">{S.seuNome}</label>
                          <input id="bk-nome" value={bk.nome} onChange={(e) => setBk((b) => ({ ...b, nome: e.target.value }))} placeholder={S.nomePh} />
                        </div>
                        <div className="bshop-field">
                          <label htmlFor="bk-tel">{S.seuWhats}</label>
                          <input id="bk-tel" type="tel" value={bk.telefone} onChange={(e) => setBk((b) => ({ ...b, telefone: e.target.value }))} placeholder={S.telPh} />
                        </div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>

                {erro && <p className="bshop-book-error">{erro}</p>}
                <div className="bshop-book-actions">
                  {step > 0
                    ? <button className="bshop-btn-back" onClick={back}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> {S.voltar}</button>
                    : <span />}
                  <button className="bshop-btn bshop-btn-primary" onClick={next}>
                    {step === finalStep ? <><MessageCircle size={15} /> {S.enviarWhats}</> : <>{S.continuar} <ArrowRight size={15} /></>}
                  </button>
                </div>
                <p className="bshop-book-msg">{S.bookMsg}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ---------- Lightbox (portal + nav por setas) ---------- */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {lightbox !== null && galeria[lightbox] && (
            <motion.div className="bshop-lightbox"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setLightbox(null)}>
              <motion.img key={lightbox} src={galeria[lightbox]} alt={`${cfg.nome} — foto ${lightbox + 1}`}
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                drag={galeria.length > 1 ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                onDragEnd={(_, info) => {
                  const swipe = Math.abs(info.offset.x) > 60 || Math.abs(info.velocity.x) > 450;
                  if (!swipe) return;
                  setLightbox(info.offset.x < 0
                    ? (lightbox + 1) % galeria.length
                    : (lightbox - 1 + galeria.length) % galeria.length);
                }}
                whileDrag={{ cursor: "grabbing" }}
                style={{ touchAction: "pan-y", cursor: galeria.length > 1 ? "grab" : "default" }}
                onClick={(e) => e.stopPropagation()} />
              <span className="bshop-lightbox-cap">
                {cfg.nome} · {lightbox + 1}/{galeria.length}
                {galeria.length > 1 && <em className="bshop-lightbox-swipe">{S.arraste}</em>}
              </span>
              {galeria.length > 1 && (
                <>
                  <button className="bshop-lightbox-nav prev" aria-label={S.anterior}
                    onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + galeria.length) % galeria.length); }}>
                    <ArrowLeft size={18} />
                  </button>
                  <button className="bshop-lightbox-nav next" aria-label={S.proxima}
                    onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % galeria.length); }}>
                    <ArrowRight size={18} />
                  </button>
                </>
              )}
              <button className="bshop-lightbox-close" aria-label={S.fechar} onClick={() => setLightbox(null)}><X size={18} /></button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/* Componentes compartilhados em ./primitives (Magnetic, RevealText, FadeUp,
   Spotlight, VideoCard, CountUp, useBooking, useOverlayLock). */
