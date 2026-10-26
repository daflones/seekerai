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
  ArrowLeft, ArrowRight, ArrowUp, CalendarDays,
  Instagram, MapPin, Menu, MessageCircle, Phone, Sparkles, Tag, X,
} from "lucide-react";
import type { SiteConfig, SiteServico } from "@/lib/sites";
import { ImageStreamHero } from "./image-stream-hero";
import {
  CountUp, EASE, FadeUp, Magnetic, RevealText, Spotlight,
  useBooking, useOverlayLock, VideoCard,
} from "./primitives";
import { conjLugar, conjNoLugar, siteLocale, siteMoney, siteStrings } from "./site-i18n";
import "./beauty.css";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export function BeautySite({ slug, config }: { slug: string; config: SiteConfig }) {
  const cfg = config;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  // "Visite-nos": modal próprio dos nichos de loja/mercado — CTA vira
  // experiência (endereço, horários, rotas) em vez de pulo pro Maps.
  const [visitOpen, setVisitOpen] = useState(false);
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
  const faqImagens = cfg.faqImagens ?? [];
  // lightbox cobre galeria + cards de dúvidas
  const lightboxImgs = [...galeria, ...faqImagens];
  const videosAll = cfg.videos ?? [];
  const destaqueVideo = videosAll.find((v) => v.destaque) ?? videosAll[0] ?? null;
  const outrosVideos = videosAll.filter((v) => v !== destaqueVideo);
  const giant = marca.split(" ")[0].toUpperCase();

  // Serviços agrupados por categoria (menu editorial)
  const servicosPorCat = (cfg.servicos ?? []).reduce<Record<string, SiteServico[]>>((acc, s) => {
    const cat = s.categoria ?? siteStrings(cfg.lang).catFallback;
    (acc[cat] ??= []).push(s);
    return acc;
  }, {});

  // ---------- Lenis + ScrollTrigger ----------
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
    if (lenisRef.current) lenisRef.current.scrollTo(el as HTMLElement, { offset: -72 });
    else el.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ---------- GSAP: parallax hero + cortina do footer ----------
  useEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      if (heroImgRef.current) {
        gsap.fromTo(heroImgRef.current, { yPercent: -6, scale: 1.08 }, {
          yPercent: 6, ease: "none",
          scrollTrigger: { trigger: ".bbeauty-hero", start: "top top", end: "bottom top", scrub: true },
        });
      }
      gsap.fromTo(giantRef.current, { y: "10vh", scale: 0.9, opacity: 0 }, {
        y: "0vh", scale: 1, opacity: 1, ease: "power1.out",
        scrollTrigger: { trigger: ".bbeauty-footer-wrap", start: "top 80%", end: "bottom bottom", scrub: 1 },
      });
      gsap.fromTo(footBodyRef.current, { y: 50, opacity: 0 }, {
        y: 0, opacity: 1, ease: "power3.out",
        scrollTrigger: { trigger: ".bbeauty-footer-wrap", start: "top 45%", end: "bottom bottom", scrub: 1 },
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

  useOverlayLock(lightbox !== null || bookOpen || visitOpen, {
    onEscape: () => { setLightbox(null); setBookOpen(false); setVisitOpen(false); },
    lightbox: { index: lightbox, total: lightboxImgs.length, go: setLightbox },
  });

  const vocab = cfg.vocab;
  const S = siteStrings(cfg.lang);
  const money = siteMoney(cfg.lang);
  const dows = S.dows;
  const fmtDia = new Intl.DateTimeFormat(siteLocale(cfg.lang), { day: "numeric", month: "short" });
  // "o estúdio" → "do estúdio"/"no estúdio" (ou "at the studio"… no idioma do site).
  const deLugar = conjLugar(vocab?.prep ?? S.prepFallback, cfg.lang);
  const noLugar = conjNoLugar(deLugar, cfg.lang);

  // CTA por nicho: "agendar" abre o fluxo de horário; "zap" pede pelo
  // WhatsApp; "mapa" leva ao endereço. Sem destino, cai pro #contato.
  const ctaKind = vocab?.cta ?? "agendar";
  const ctaLabel = vocab?.ctaLabel ?? S.ctaAgendar;
  const waHref = waNumber ? `https://wa.me/${waNumber}` : null;
  const telHref = cfg.contato.telefone ? `tel:${cfg.contato.telefone.replace(/\D/g, "")}` : null;
  const ctaHref = ctaKind === "mapa"
    ? (cfg.contato.mapsUrl ?? waHref ?? telHref)
    : ctaKind === "zap"
      ? (waHref ?? cfg.contato.mapsUrl ?? telHref)
      : null;
  const servicosLabel = vocab?.servicosLabel ?? S.catFallback;
  const temOfertas = (cfg.ofertas?.length ?? 0) > 0 && Boolean(vocab?.ofertasTitle);
  const ofertasNav = vocab?.ofertasTitle?.split(" ")[0] ?? S.ofertas;

  const CtaButton = ({ className, onClick, children }: { className: string; onClick?: () => void; children: React.ReactNode }) =>
    ctaHref
      ? <a className={className} href={ctaHref} target="_blank" rel="noopener noreferrer" onClick={onClick}>{children}</a>
      : <button type="button" className={className}
          onClick={() => {
            onClick?.();
            if (ctaKind === "agendar") openBook();
            else if (ctaKind === "mapa") setVisitOpen(true);
            else scrollTo("#contato");
          }}>{children}</button>;

  const waServico = (nome: string) => waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(S.waServicoMsg(vocab?.prep ?? S.prepFallback, nome))}`
    : null;

  const marqueeItems = [
    ...Object.keys(servicosPorCat),
    cfg.tagline ?? "", vocab?.marquee ?? S.marqueeFallback, marca,
  ].filter(Boolean);

  const anchor = (href: string) => (e: React.MouseEvent) => { e.preventDefault(); setMenuOpen(false); scrollTo(href); };

  const paleta = cfg.tema?.paleta;
  // Cores das fotos reais do lugar viram o accent do site.
  const themeVars = cfg.tema?.cores
    ? { "--bb-accent": cfg.tema.cores.accent, "--bb-accent-2": cfg.tema.cores.accent2 } as React.CSSProperties
    : undefined;
  return (
    <div className="bbeauty" ref={rootRef} data-palette={paleta} data-variant={cfg.tema?.variant} style={themeVars}>
      <div className="bbeauty-ambient" aria-hidden><i className="orb-a" /><i className="orb-b" /><i className="orb-c" /></div>
      <div className="bbeauty-grain" aria-hidden />
      <motion.div className="bbeauty-progress" style={{ scaleX: scrollYProgress }} aria-hidden />
      {cfg.seo && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org", "@type": vocab?.schema ?? "LocalBusiness",
            name: cfg.nome, address: cfg.contato.endereco, telephone: cfg.contato.telefone,
            url: `https://seekerai.digital/site/${slug}`,
            ...(cfg.avaliacoes ? { aggregateRating: { "@type": "AggregateRating", ratingValue: cfg.avaliacoes.nota, reviewCount: cfg.avaliacoes.total } } : {}),
          }),
        }} />
      )}

      {/* ---------- NAV ---------- */}
      <nav className={`bbeauty-nav${scrolled ? " is-scrolled" : ""}`}>
        <a className="bbeauty-logo" href="#top" onClick={anchor("#top")} aria-label={cfg.nome}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cfg.logo && <img src={cfg.logo} alt={`Monograma ${cfg.nome}`} />}
          <span className="bbeauty-logo-name">{marca}<small>{cfg.tagline ?? vocab?.rotulo ?? "Estabelecimento"}</small></span>
        </a>
        <div className="bbeauty-nav-links">
          {cfg.historia && <a href="#espaco" onClick={anchor("#espaco")}>{deLugar.charAt(0).toUpperCase()+deLugar.slice(1)}</a>}
          <a href="#servicos" onClick={anchor("#servicos")}>{servicosLabel}</a>
          {temOfertas && <a href="#ofertas" onClick={anchor("#ofertas")} className="bbeauty-nav-ofertas">{ofertasNav}</a>}
          <a href="#portfolio" onClick={anchor("#portfolio")}>{S.navPortfolio}</a>
          {(cfg.faq?.length ?? 0) > 0 && <a href="#duvidas" onClick={anchor("#duvidas")}>{S.navDuvidas}</a>}
          <a href="#contato" onClick={anchor("#contato")}>{S.navContato}</a>
          <CtaButton className="bbeauty-nav-cta">{ctaLabel}</CtaButton>
        </div>
        <button className="bbeauty-nav-burger" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      <AnimatePresence>
        {menuOpen && (
          <motion.div className="bbeauty-mobile-menu"
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: EASE }}>
            {cfg.historia && <a href="#espaco" onClick={anchor("#espaco")}>{deLugar.charAt(0).toUpperCase()+deLugar.slice(1)}</a>}
            <a href="#servicos" onClick={anchor("#servicos")}>{servicosLabel}</a>
            {temOfertas && <a href="#ofertas" onClick={anchor("#ofertas")}>{ofertasNav}</a>}
            <a href="#portfolio" onClick={anchor("#portfolio")}>{S.navPortfolio}</a>
            {(cfg.faq?.length ?? 0) > 0 && <a href="#duvidas" onClick={anchor("#duvidas")}>{S.navDuvidas}</a>}
            <a href="#contato" onClick={anchor("#contato")}>{S.navContato}</a>
            <CtaButton className="bbeauty-mobile-cta" onClick={() => setMenuOpen(false)}>{ctaLabel}</CtaButton>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- HERO editorial ---------- */}
      <header className="bbeauty-hero" id="top">
        <div className="bbeauty-hero-content bbeauty-wrap">
          <div className="bbeauty-hero-main">
            <motion.span className="bbeauty-eyebrow"
              initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: EASE }}>
              {cfg.cidade ?? vocab?.rotulo ?? "Estabelecimento"}
            </motion.span>
            <h1>
              <RevealText text={S.heroTop} delay={0.2} />
              <span className="h1-em"><RevealText text={vocab?.em ?? "se cuidar e se amar"} delay={0.55} /></span>
            </h1>
            <div className="bbeauty-hero-bottom">
              <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.7, ease: EASE }}>
                {cfg.avaliacoes && (
                  <span className="bbeauty-rating-chip">
                    <span className="stars">★★★★★</span>
                    {cfg.avaliacoes.nota.toFixed(1)} · {S.reviewsTotal(cfg.avaliacoes.total, cfg.avaliacoes.fonte)}
                  </span>
                )}
                <p className="bbeauty-hero-desc">
                  {cfg.tagline ? `${cfg.tagline} em ` : ""}{cfg.cidade?.replace(" · ", ", ") ?? ""} — {vocab?.desc ?? "atendimento de verdade, sem pressa."}
                </p>
              </motion.div>
              <motion.div className="bbeauty-hero-actions"
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.9, ease: EASE }}>
                <a className="bbeauty-scroll-hint" href="#espaco" onClick={anchor("#espaco")}>
                  <span className="bbeauty-shader-text">{S.scrollConhecer(vocab?.prep ?? S.prepFallback)}</span>
                  <span className="bbeauty-scroll-hint-line" aria-hidden />
                </a>
              </motion.div>
            </div>
          </div>

          {/* Composição editorial: frame em arco + polaroid */}
          <div className="bbeauty-hero-photos">
            <span className="bbeauty-hero-ring" aria-hidden />
            {cfg.fotos.hero && (
              <motion.figure className="bbeauty-hero-photo"
                initial={{ opacity: 0, y: 40, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 1.1, delay: 0.4, ease: EASE }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={heroImgRef} src={cfg.fotos.hero} alt={`${cfg.nome} — trabalho realizado`} />
              </motion.figure>
            )}
            {galeria[0] && (
              <motion.figure className="bbeauty-hero-polaroid"
                initial={{ opacity: 0, y: 30, rotate: -10 }}
                animate={{ opacity: 1, y: 0, rotate: -5 }}
                transition={{ duration: 1, delay: 0.7, ease: EASE }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={galeria[0]} alt={`${cfg.nome} — detalhe`} />
              </motion.figure>
            )}
          </div>
        </div>
        <motion.div className="bbeauty-hero-scroll" aria-hidden
          animate={reduced ? {} : { y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
          <span />
        </motion.div>
      </header>

      {/* ---------- MARQUEE ---------- */}
      <div className="bbeauty-marquee" aria-hidden>
        <div className="bbeauty-marquee-track">
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

      {/* ---------- O ESPAÇO + VÍDEO DESTAQUE ---------- */}
      {(cfg.historia || destaqueVideo) && (
        <section className="bbeauty-section" id="espaco">
          <div className="bbeauty-wrap">
            <div className="bbeauty-space">
              <div className="bbeauty-space-text">
                <div className="bbeauty-section-head">
                  <FadeUp y={16}><span className="bbeauty-eyebrow">{deLugar.charAt(0).toUpperCase()+deLugar.slice(1)}</span></FadeUp>
                  <h2 className="bbeauty-h2"><RevealText text={cfg.historia?.titulo ?? "Feito para você" } /></h2>
                </div>
                {(cfg.historia?.paragrafos ?? []).map((p, i) => (
                  <FadeUp key={i} delay={i * 0.08}><p dangerouslySetInnerHTML={{ __html: p }} /></FadeUp>
                ))}
              </div>
              {destaqueVideo && (
                <FadeUp delay={0.15} className="bbeauty-space-feature">
                  <VideoCard v={destaqueVideo} tall ns="bbeauty" />
                </FadeUp>
              )}
            </div>
            {outrosVideos.length > 0 && (
              <div className="bbeauty-reels-wrap">
                <FadeUp y={14}><span className="bbeauty-eyebrow bbeauty-eyebrow-solo">{S.reelsEyebrow}</span></FadeUp>
                <div className="bbeauty-reels">
                  {outrosVideos.map((v, i) => (
                    <motion.div key={i} className="bbeauty-reel"
                      initial={reduced ? false : { opacity: 0, x: 40 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.55, delay: i * 0.07, ease: EASE }}>
                      <VideoCard v={v} reel ns="bbeauty" />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- SERVIÇOS (menu editorial por categoria) ---------- */}
      <section className="bbeauty-section" id="servicos" style={{ paddingTop: 0 }}>
        <div className="bbeauty-wrap">
          <div className="bbeauty-section-head">
            <FadeUp y={16}><span className="bbeauty-eyebrow">{servicosLabel}</span></FadeUp>
            <h2 className="bbeauty-h2"><RevealText text={vocab?.servicosTitle ?? S.servicosTitleFb} /> <em><RevealText text={vocab?.servicosEm ?? S.momentoFb} delay={0.25} /></em></h2>
          </div>
          <div className="bbeauty-services">
            {Object.entries(servicosPorCat).map(([cat, itens], ci) => (
              <FadeUp key={cat} delay={ci * 0.08}>
                <div className="bbeauty-service-cat">
                  <h3>{cat}</h3>
                  <small>{itens.length} {itens.length === 1 ? "item" : "itens"} · {vocab?.servicosHint ?? "toque para agendar"}</small>
                  {itens.map((s) => {
                    const meta = <>
                      {s.duracaoMin ? `~${s.duracaoMin} min` : ""}
                      {s.preco ? ` · ${money.format(s.preco)}` : ""}
                      {ctaKind === "agendar" && !s.preco && !s.duracaoMin ? <span className="ask">{S.sobConsulta}</span> : null}
                      {ctaKind === "agendar" && !s.preco && s.duracaoMin ? <span className="ask"> · valor {noLugar}</span> : null}
                      {ctaKind !== "agendar" && !s.preco ? <span className="ask">›</span> : null}
                    </>;
                    const wa = ctaKind !== "agendar" ? waServico(s.nome) : null;
                    const main = (
                      <span className="s-main">
                        <span className="s-nome">{s.nome}</span>
                        {s.descricao && <small className="s-desc">{s.descricao}</small>}
                      </span>
                    );
                    return wa
                      ? <a key={s.nome} className="bbeauty-service-row" href={wa} target="_blank" rel="noopener noreferrer">
                          {main}<span className="s-dots" aria-hidden /><span className="s-meta">{meta}</span>
                        </a>
                      : <button key={s.nome} type="button" className="bbeauty-service-row" onClick={() => openBook(s)}>
                          {main}<span className="s-dots" aria-hidden /><span className="s-meta">{meta}</span>
                        </button>;
                  })}
                </div>
              </FadeUp>
            ))}
          </div>
          <FadeUp><p className="bbeauty-service-note">{S.serviceNote}</p></FadeUp>
        </div>
      </section>

      {/* ---------- OFERTAS (quando o material do IG mostra promoções) ---------- */}
      {temOfertas && (
        <section className="bbeauty-section bbeauty-ofertas" id="ofertas" style={{ paddingTop: 0 }}>
          <div className="bbeauty-wrap">
            <div className="bbeauty-section-head">
              <FadeUp y={16}><span className="bbeauty-eyebrow">{S.ofertasEyebrow}</span></FadeUp>
              <h2 className="bbeauty-h2"><RevealText text={vocab?.ofertasTitle ?? "Ofertas"} /></h2>
            </div>
            <div className="bbeauty-deals">
              {(cfg.ofertas ?? []).map((o, i) => (
                <motion.article key={i} className="bbeauty-deal"
                  initial={{ opacity: 0, y: 22, rotate: i % 2 ? 1.2 : -1.2 }}
                  whileInView={{ opacity: 1, y: 0, rotate: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.55, delay: i * 0.08, ease: EASE }}>
                  {o.tag && <span className="bbeauty-deal-tag"><Tag size={11} />{o.tag}</span>}
                  <strong>{o.titulo}</strong>
                  {o.texto && <p>{o.texto}</p>}
                  {waNumber && (
                    <a className="bbeauty-deal-cta" href={waServico(o.titulo) ?? `https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer">
                      {ctaKind === "mapa" ? S.dealAproveitar : S.dealQuero} <ArrowRight size={13} />
                    </a>
                  )}
                </motion.article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- CORREDOR 3D ---------- */}
      {galeria.length > 0 && (
        <section className="bbeauty-corridor" aria-label={`${S.trabalhosA} ${deLugar}`}>
          <ImageStreamHero
            images={galeria.map((src, i) => ({ src, alt: `${cfg.nome} — ${S.trabalhosA.toLowerCase()} ${i + 1}` }))}
            cards={9}
            speed={24}
            className="bbeauty-corridor-stream">
            <div className="bbeauty-corridor-overlay">
              <FadeUp><span className="bbeauty-eyebrow">{S.portfolioEyebrow}</span></FadeUp>
              <h2 className="bbeauty-corridor-title">
                <RevealText text={S.corridorA} /> <em><RevealText text={S.corridorB} delay={0.3} /></em>
              </h2>
            </div>
          </ImageStreamHero>
        </section>
      )}

      {/* ---------- PORTFÓLIO (masonry + lightbox) ---------- */}
      {galeria.length > 0 && (
        <section className="bbeauty-section" id="portfolio" style={{ paddingTop: 0 }}>
          <div className="bbeauty-wrap">
            <div className="bbeauty-section-head">
              <FadeUp y={16}><span className="bbeauty-eyebrow">{S.portfolioEyebrow}</span></FadeUp>
              <h2 className="bbeauty-h2"><RevealText text={`${S.trabalhosA} ${deLugar}`} /> <em><RevealText text={S.emDestaque} delay={0.25} /></em></h2>
            </div>
            <div className="bbeauty-gallery">
              {galeria.map((src, i) => (
                <motion.button key={i} type="button" className="bbeauty-gallery-item"
                  onClick={() => setLightbox(i)}
                  initial={reduced ? false : { opacity: 0, y: 20, filter: "blur(6px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.6, delay: (i % 9) * 0.05, ease: EASE }}
                  whileHover={reduced ? undefined : { y: -4 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${cfg.nome} — trabalho ${i + 1}`} loading="lazy" />
                  <span className="bbeauty-gallery-cap">
                    <span>{cfg.nome}</span><small>Trabalho {i + 1} · ampliar</small>
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- DIFERENCIAIS ---------- */}
      {(cfg.diferenciais?.length ?? 0) > 0 && (
        <section className="bbeauty-section" style={{ paddingTop: 0 }}>
          <div className="bbeauty-wrap">
            <div className="bbeauty-section-head">
              <FadeUp y={16}><span className="bbeauty-eyebrow">{S.experienciaEyebrow}</span></FadeUp>
              <h2 className="bbeauty-h2"><RevealText text={S.pensadoA} /> <em><RevealText text={S.pensadoB} delay={0.25} /></em></h2>
            </div>
            <div className="bbeauty-perks">
              {(cfg.diferenciais ?? []).map((d, i) => (
                <motion.span key={d} className="bbeauty-perk"
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

      {/* ---------- EQUIPE ---------- */}
      {hasPros && (
        <section className="bbeauty-section" style={{ paddingTop: 0 }}>
          <div className="bbeauty-wrap">
            <div className="bbeauty-section-head">
              <FadeUp y={16}><span className="bbeauty-eyebrow">{S.equipeEyebrow}</span></FadeUp>
              <h2 className="bbeauty-h2"><RevealText text={S.equipeA} /> <em><RevealText text={S.equipeB} delay={0.25} /></em></h2>
            </div>
            <div className="bbeauty-team">
              {pros.map((p, i) => (
                <motion.div key={p.nome} className="bbeauty-member"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: i * 0.08, ease: EASE }}>
                  <span className="m-mono">{p.nome[0]}</span>
                  <strong>{p.nome}</strong>
                  <small>{p.especialidade ?? S.profissional}</small>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- AVALIAÇÕES ---------- */}
      {cfg.avaliacoes && (
        <section className="bbeauty-section">
          <div className="bbeauty-wrap">
            <FadeUp>
              <div className="bbeauty-rating-hero">
                <div className="big"><CountUp to={cfg.avaliacoes.nota} /></div>
                <div className="stars">★★★★★</div>
                <small>{S.reviewsReal(cfg.avaliacoes.total, cfg.avaliacoes.fonte)}</small>
              </div>
            </FadeUp>
            {(cfg.avaliacoes.itens?.length ?? 0) > 0 && (
              <div className="bbeauty-reviews">
                {cfg.avaliacoes.print && (
                  <motion.div className="bbeauty-review-print"
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease: EASE }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cfg.avaliacoes.print} alt={S.recadoAlt} loading="lazy" />
                    <small>{S.recadoCliente}</small>
                  </motion.div>
                )}
                {(cfg.avaliacoes.itens ?? []).map((r, i) => (
                  <motion.article key={i} className="bbeauty-review"
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-8% 0px" }}
                    transition={{ duration: 0.6, delay: (i % 4) * 0.08, ease: EASE }}>
                    <span className="stars">{"★".repeat(r.nota ?? 5)}</span>
                    <p>“{r.texto}”</p>
                    <footer>
                      {r.foto && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img className="bbeauty-review-avatar" src={r.foto} alt="" loading="lazy" />
                      )}
                      <span>{r.autor}</span>{r.quando && <span>{r.quando}</span>}
                    </footer>
                  </motion.article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- CONTATO ---------- */}
      <section className="bbeauty-section" id="contato" style={{ paddingTop: 0 }}>
        <div className="bbeauty-wrap">
          <div className="bbeauty-section-head">
            <FadeUp y={16}><span className="bbeauty-eyebrow">{S.ondeEstamos}</span></FadeUp>
            <h2 className="bbeauty-h2"><RevealText text={S.esperamosA} /> <em><RevealText text={S.esperamosB} delay={0.25} /></em></h2>
          </div>
          <div className="bbeauty-contact">
            <FadeUp delay={0}>
              <Spotlight className="bbeauty-contact-card">
                <h3><MapPin size={17} /> {S.endereco}</h3>
                <p>{cfg.contato.endereco}</p>
                {cfg.contato.mapsUrl && (
                  <div className="bbeauty-contact-links">
                    <a href={cfg.contato.mapsUrl} target="_blank" rel="noopener">{S.abrirMaps} <ArrowRight size={13} /></a>
                  </div>
                )}
              </Spotlight>
            </FadeUp>
            {(cfg.horariosLabel?.length ?? 0) > 0 && (
              <FadeUp delay={0.1}>
                <Spotlight className="bbeauty-contact-card">
                  <h3><CalendarDays size={17} /> {S.horarios}</h3>
                  {(cfg.horariosLabel ?? []).map(([d, h]) => (
                    <div key={d} className="bbeauty-hours-line"><span>{d}</span><strong>{h}</strong></div>
                  ))}
                </Spotlight>
              </FadeUp>
            )}
            <FadeUp delay={0.2}>
              <Spotlight className="bbeauty-contact-card">
                <h3><Phone size={17} /> {S.contato}</h3>
                {cfg.contato.telefone && <p>{cfg.contato.telefone}</p>}
                <div className="bbeauty-contact-links">
                  {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener"><MessageCircle size={14} /> {S.chamarWa}</a>}
                  {cfg.contato.instagram && <a href={`https://instagram.com/${cfg.contato.instagram}`} target="_blank" rel="noopener"><Instagram size={14} /> @{cfg.contato.instagram}</a>}
                  {cfg.contato.telefone && <a href={`tel:${cfg.contato.telefone.replace(/\D/g, "")}`}><Phone size={14} /> {S.ligar}</a>}
                </div>
              </Spotlight>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ---------- DÚVIDAS (cards em imagem ou acordeão) ---------- */}
      {(faqImagens.length > 0 || (cfg.faq?.length ?? 0) > 0) && (
        <section className="bbeauty-section" id="duvidas" style={{ paddingTop: 0 }}>
          <div className="bbeauty-wrap">
            <div className="bbeauty-section-head">
              <FadeUp y={16}><span className="bbeauty-eyebrow">{S.duvidas}</span></FadeUp>
              <h2 className="bbeauty-h2"><RevealText text={S.faqA} /> <em><RevealText text={S.faqB} delay={0.25} /></em></h2>
            </div>
            {faqImagens.length > 0 ? (
              <div className="bbeauty-duvidas">
                {faqImagens.map((src, i) => (
                  <motion.button key={i} type="button" className="bbeauty-duvida-card"
                    onClick={() => setLightbox(galeria.length + i)}
                    initial={reduced ? false : { opacity: 0, x: 40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.55, delay: i * 0.07, ease: EASE }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`${S.faqA} ${S.faqB} ${i + 1} / ${faqImagens.length}`} loading="lazy" />
                  </motion.button>
                ))}
              </div>
            ) : (
            <FadeUp>
              <div className="bbeauty-faq">
                {(cfg.faq ?? []).map((f, i) => (
                  <div key={i} className={`bbeauty-faq-item${faqOpen === i ? " open" : ""}`}>
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
            )}
          </div>
        </section>
      )}

      {/* ---------- FOOTER CINEMATOGRÁFICO ---------- */}
      <div className="bbeauty-footer-wrap" style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" }}>
        <footer className="bbeauty-footer">
          <div className="bbeauty-footer-aurora" aria-hidden />
          <div className="bbeauty-footer-grid" aria-hidden />
          <div className="bbeauty-footer-giant" ref={giantRef} aria-hidden>{giant}</div>

          <div className="bbeauty-footer-marquee" aria-hidden>
            <div className="bbeauty-marquee-track">
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

          <div className="bbeauty-footer-body" ref={footBodyRef}>
            <h2 className="bbeauty-footer-h2">{S.footerA}<br /><em>{vocab?.ctaEm ?? S.ctaEmFb}</em></h2>
            <div className="bbeauty-footer-pills">
              <Magnetic><CtaButton className="bbeauty-pill primary"><Sparkles size={15} /> {ctaLabel}</CtaButton></Magnetic>
              {waNumber && <Magnetic><a className="bbeauty-pill" href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener"><MessageCircle size={15} /> WhatsApp</a></Magnetic>}
              {cfg.contato.mapsUrl && <Magnetic><a className="bbeauty-pill" href={cfg.contato.mapsUrl} target="_blank" rel="noopener"><MapPin size={15} /> {S.comoChegar}</a></Magnetic>}
              {cfg.contato.instagram && <Magnetic><a className="bbeauty-pill" href={`https://instagram.com/${cfg.contato.instagram}`} target="_blank" rel="noopener"><Instagram size={15} /> Instagram</a></Magnetic>}
            </div>
          </div>

          <div className="bbeauty-footer-bar">
            <small>© {new Date().getFullYear()} {cfg.nome} · Todos os direitos</small>
            <div className="bbeauty-pill bbeauty-footer-craft">
              <small>{S.feitoCom}</small><span className="bbeauty-heart">♥</span><small>{S.por}</small><strong>SeekerAi</strong>
            </div>
            <Magnetic>
              <button className="bbeauty-pill bbeauty-footer-top" aria-label={S.voltarTopo}
                onClick={() => (lenisRef.current ? lenisRef.current.scrollTo(0) : window.scrollTo({ top: 0, behavior: "smooth" }))}>
                <ArrowUp size={17} />
              </button>
            </Magnetic>
          </div>
        </footer>
      </div>

      {/* ---------- WhatsApp flutuante ---------- */}
      {waNumber && (
        <a className="bbeauty-wa-float" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(S.waFloatMsg(cfg.nome))}`}
          target="_blank" rel="noopener" aria-label={S.chamarWa}>
          <MessageCircle size={26} />
        </a>
      )}

      {/* ---------- Modal de agendamento ---------- */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {bookOpen && (
            <motion.div className="bbeauty-book-modal-bg" data-palette={paleta} style={themeVars}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setBookOpen(false)}>
              <motion.div className="bbeauty-booking-card bbeauty-book-modal"
                initial={{ opacity: 0, y: 42, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                onClick={(e) => e.stopPropagation()}>
                <button className="bbeauty-modal-close" aria-label={S.fechar} onClick={() => setBookOpen(false)}><X size={17} /></button>
                <div className="bbeauty-book-modal-head">
                  <span className="bbeauty-eyebrow">{S.agendamento}</span>
                  <h2 className="bbeauty-modal-h2">{S.reserveA} <em>{S.reserveB}</em></h2>
                </div>
                <div className="bbeauty-steps">{Array.from({ length: stepsTotal }).map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>

                <AnimatePresence mode="wait">
                  <motion.div key={step}
                    initial={{ opacity: 0, x: reduced ? 0 : 26 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: reduced ? 0 : -26 }}
                    transition={{ duration: 0.3, ease: EASE }}>

                    {step === 0 && (
                      <>
                        <h3 className="bbeauty-step-title">{S.stepServico}</h3>
                        <div className="bbeauty-pick-grid">
                          {cfg.servicos.map((s) => (
                            <button key={s.nome} className={`bbeauty-pick${bk.servico?.nome === s.nome ? " on" : ""}`}
                              onClick={() => setBk((b) => ({ ...b, servico: s, hora: null }))}>
                              <strong>{s.nome}</strong>
                              <small>{s.categoria ?? ""}{s.duracaoMin ? ` · ~${s.duracaoMin} min` : ""}{s.preco ? ` · ${money.format(s.preco)}` : ""}</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {hasPros && step === 1 && (
                      <>
                        <h3 className="bbeauty-step-title">{S.stepProf}</h3>
                        <div className="bbeauty-pick-grid">
                          <button className={`bbeauty-pick${bk.profissional === S.semPref ? " on" : ""}`}
                            onClick={() => setBk((b) => ({ ...b, profissional: S.semPref }))}>
                            <strong>{S.semPref}</strong><small>{S.primeiraDisp}</small>
                          </button>
                          {pros.map((p) => (
                            <button key={p.nome} className={`bbeauty-pick${bk.profissional === p.nome ? " on" : ""}`}
                              onClick={() => setBk((b) => ({ ...b, profissional: p.nome }))}>
                              <strong>{p.nome}</strong><small>{p.especialidade ?? S.profissional}</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {step === dataStep && (
                      <>
                        <h3 className="bbeauty-step-title">{hasPros ? "3" : "2"}. {S.stepData}</h3>
                        <div className="bbeauty-days">
                          {dias.map(({ d, aberto }) => (
                            <button key={d.toISOString()} disabled={!aberto}
                              className={`bbeauty-day${bk.data?.toDateString() === d.toDateString() ? " on" : ""}${aberto ? "" : " off"}`}
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
                        <h3 className="bbeauty-step-title">{hasPros ? "4" : "3"}. {S.stepHora}</h3>
                        {slots.length === 0
                          ? <p className="bbeauty-book-error">{S.semHorarios}</p>
                          : <div className="bbeauty-slots">
                              {slots.map((h) => (
                                <button key={h} className={`bbeauty-slot${bk.hora === h ? " on" : ""}`}
                                  onClick={() => setBk((b) => ({ ...b, hora: h }))}>{h}</button>
                              ))}
                            </div>}
                      </>
                    )}

                    {step === finalStep && (
                      <>
                        <h3 className="bbeauty-step-title">{hasPros ? "5" : "4"}. {S.stepConfirma}</h3>
                        <dl className="bbeauty-summary">
                          <div><dt>{S.sumServico}</dt><dd>{bk.servico?.nome}{bk.servico?.preco ? ` — ${money.format(bk.servico.preco)}` : ""}</dd></div>
                          {bk.profissional && bk.profissional !== S.semPref && <div><dt>{S.sumProf}</dt><dd>{bk.profissional}</dd></div>}
                          <div><dt>{S.sumData}</dt><dd>{dataLabel}</dd></div>
                          <div><dt>{S.sumHora}</dt><dd>{bk.hora}</dd></div>
                        </dl>
                        <div className="bbeauty-field">
                          <label htmlFor="bk-nome">{S.seuNome}</label>
                          <input id="bk-nome" value={bk.nome} onChange={(e) => setBk((b) => ({ ...b, nome: e.target.value }))} placeholder={S.nomePh} />
                        </div>
                        <div className="bbeauty-field">
                          <label htmlFor="bk-tel">{S.seuWhats}</label>
                          <input id="bk-tel" type="tel" value={bk.telefone} onChange={(e) => setBk((b) => ({ ...b, telefone: e.target.value }))} placeholder={S.telPh} />
                        </div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>

                {erro && <p className="bbeauty-book-error">{erro}</p>}
                <div className="bbeauty-book-actions">
                  {step > 0
                    ? <button className="bbeauty-btn-back" onClick={back}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> {S.voltar}</button>
                    : <span />}
                  <button className="bbeauty-btn bbeauty-btn-primary" onClick={next}>
                    {step === finalStep ? <><MessageCircle size={15} /> {S.enviarWhats}</> : <>{S.continuar} <ArrowRight size={15} /></>}
                  </button>
                </div>
                <p className="bbeauty-book-msg">{S.bookMsg}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ---------- Modal "Visite-nos" (nichos de loja/mercado) ---------- */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {visitOpen && (
            <motion.div className="bbeauty-book-modal-bg" data-palette={paleta} style={themeVars}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setVisitOpen(false)}>
              <motion.div className="bbeauty-booking-card bbeauty-book-modal bbeauty-visit-modal"
                initial={{ opacity: 0, y: 42, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                onClick={(e) => e.stopPropagation()}>
                <button className="bbeauty-modal-close" aria-label={S.fechar} onClick={() => setVisitOpen(false)}><X size={17} /></button>
                <div className="bbeauty-book-modal-head">
                  <span className="bbeauty-eyebrow">{S.visitEyebrow}</span>
                  <h2 className="bbeauty-modal-h2">{S.visitTitle(noLugar).replace(noLugar, "").trim()} <em>{noLugar}</em></h2>
                </div>
                {cfg.contato.endereco && (
                  <p className="bbeauty-visit-line"><MapPin size={15} />{cfg.contato.endereco}</p>
                )}
                {(cfg.horariosLabel?.length ?? 0) > 0 && (
                  <div className="bbeauty-visit-hours">
                    {(cfg.horariosLabel ?? []).map(([d, h]) => (
                      <div key={d} className="bbeauty-hours-line"><span>{d}</span><strong>{h}</strong></div>
                    ))}
                  </div>
                )}
                <div className="bbeauty-visit-actions">
                  {cfg.contato.mapsUrl && (
                    <a className="bbeauty-pill primary" href={cfg.contato.mapsUrl} target="_blank" rel="noopener noreferrer">
                      <MapPin size={15} /> {S.tracaRota}
                    </a>
                  )}
                  {waNumber && (
                    <a className="bbeauty-pill" href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle size={15} /> WhatsApp
                    </a>
                  )}
                  {telHref && <a className="bbeauty-pill" href={telHref}><Phone size={15} /> {S.ligarShort}</a>}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ---------- Lightbox (portal + swipe + setas) ---------- */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {lightbox !== null && lightboxImgs[lightbox] && (
            <motion.div className="bbeauty-lightbox" data-palette={paleta} style={themeVars}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setLightbox(null)}>
              <motion.img key={lightbox} src={lightboxImgs[lightbox]} alt={`${cfg.nome} — imagem ${lightbox + 1}`}
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                drag={lightboxImgs.length > 1 ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                onDragEnd={(_, info) => {
                  const swipe = Math.abs(info.offset.x) > 60 || Math.abs(info.velocity.x) > 450;
                  if (!swipe) return;
                  setLightbox(info.offset.x < 0
                    ? (lightbox + 1) % lightboxImgs.length
                    : (lightbox - 1 + lightboxImgs.length) % lightboxImgs.length);
                }}
                whileDrag={{ cursor: "grabbing" }}
                style={{ touchAction: "pan-y", cursor: lightboxImgs.length > 1 ? "grab" : "default" }}
                onClick={(e) => e.stopPropagation()} />
              <span className="bbeauty-lightbox-cap">
                {cfg.nome} · {lightbox + 1}/{lightboxImgs.length}
                {lightboxImgs.length > 1 && <em className="bbeauty-lightbox-swipe">{S.arraste}</em>}
              </span>
              {lightboxImgs.length > 1 && (
                <>
                  <button className="bbeauty-lightbox-nav prev" aria-label={S.anterior}
                    onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + lightboxImgs.length) % lightboxImgs.length); }}>
                    <ArrowLeft size={18} />
                  </button>
                  <button className="bbeauty-lightbox-nav next" aria-label={S.proxima}
                    onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % lightboxImgs.length); }}>
                    <ArrowRight size={18} />
                  </button>
                </>
              )}
              <button className="bbeauty-lightbox-close" aria-label={S.fechar} onClick={() => setLightbox(null)}><X size={18} /></button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
