"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence, motion, useReducedMotion, useScroll,
} from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import {
  ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Clock,
  Instagram, MapPin, Menu, MessageCircle, Phone, Play, Scissors, Sparkles, X,
} from "lucide-react";
import type { SiteConfig, SiteServico } from "@/lib/sites";
import { ImageStreamHero } from "./image-stream-hero";
import "./site.css";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const DOWS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const fmtDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const fmtMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface Booking {
  servico: SiteServico | null;
  profissional: string | null;
  data: Date | null;
  hora: string | null;
  nome: string;
  telefone: string;
}

function toMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function toHHMM(min: number) { return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }

/* ----------------------------------------------------------------------
   MagneticButton — primitivo portado de 21st.dev/@jahed/motion-footer
   (GSAP, physics-based: translate + tilt + elastic release)
---------------------------------------------------------------------- */
function Magnetic({ children, className = "", strength = 0.4 }: {
  children: React.ReactNode; className?: string; strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      gsap.to(el, {
        x: x * strength, y: y * strength,
        rotationX: -y * 0.12, rotationY: x * 0.12, scale: 1.05,
        ease: "power2.out", duration: 0.4,
      });
    };
    const leave = () => gsap.to(el, {
      x: 0, y: 0, rotationX: 0, rotationY: 0, scale: 1,
      ease: "elastic.out(1, 0.3)", duration: 1.2,
    });
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); };
  }, [reduced, strength]);

  return <div ref={ref} className={`bshop-magnetic ${className}`} style={{ transformStyle: "preserve-3d" }}>{children}</div>;
}

/* ----------------------------------------------------------------------
   RevealText — efeito "text reveal" (palavra a palavra, blur + rise)
   padrão kuratlielia/text-reveal do 21st.dev, em framer-motion.
---------------------------------------------------------------------- */
function RevealText({ text, className = "", delay = 0, once = true }: {
  text: string; className?: string; delay?: number; once?: boolean;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className}>{text}</span>;
  return (
    <span className={className} aria-label={text} role="text">
      {text.split(" ").map((w, i) => (
        <motion.span
          key={i}
          style={{ display: "inline-block", whiteSpace: "pre" }}
          initial={{ opacity: 0, y: 22, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once, margin: "-8% 0px" }}
          transition={{ duration: 0.65, delay: delay + i * 0.055, ease: EASE }}
        >{w}{" "}</motion.span>
      ))}
    </span>
  );
}

/* Fade/slide genérico ao entrar na viewport */
function FadeUp({ children, className = "", delay = 0, y = 28 }: {
  children: React.ReactNode; className?: string; delay?: number; y?: number;
}) {
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >{children}</motion.div>
  );
}

/* Card com spotlight que segue o cursor (efeito "glow card") */
function Spotlight({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`bshop-spotlight ${className}`}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
        ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}>
      {children}
    </div>
  );
}

export function BarbershopSite({ slug, config }: { slug: string; config: SiteConfig }) {
  const cfg = config;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [bk, setBk] = useState<Booking>({ servico: null, profissional: null, data: null, hora: null, nome: "", telefone: "" });
  const [erro, setErro] = useState("");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const heroImgRef = useRef<HTMLImageElement>(null);
  const giantRef = useRef<HTMLDivElement>(null);
  const footBodyRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();

  const waNumber = (cfg.contato.whatsapp ?? cfg.contato.telefone ?? "").replace(/\D/g, "");
  const marca = cfg.marca || cfg.nome;
  const pros = cfg.profissionais ?? [];
  const hasPros = pros.length > 0;
  const galeria = cfg.fotos.galeria;
  const videosAll = cfg.videos ?? [];
  const destaqueVideo = videosAll.find((v) => v.destaque) ?? videosAll[0] ?? null;
  const outrosVideos = videosAll.filter((v) => v !== destaqueVideo);

  // ---------- dias/horários disponíveis ----------
  const dias = useMemo(() => {
    const out: { d: Date; aberto: boolean }[] = [];
    const now = new Date();
    for (let i = 0; i < (cfg.booking.diasFuturos || 14); i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      out.push({ d, aberto: Boolean(cfg.horarios[String(d.getDay())]?.length) });
    }
    return out;
  }, [cfg]);

  const slots = useMemo(() => {
    if (!bk.data) return [];
    const janelas = cfg.horarios[String(bk.data.getDay())] ?? [];
    const dur = bk.servico?.duracaoMin ?? cfg.booking.slotMin;
    const stepMin = cfg.booking.slotMin || 30;
    const now = new Date();
    const isToday = bk.data.toDateString() === now.toDateString();
    const minNow = now.getHours() * 60 + now.getMinutes() + (cfg.booking.antecedenciaMin || 0);
    const out: string[] = [];
    for (const [abre, fecha] of janelas) {
      for (let m = toMin(abre); m + dur <= toMin(fecha); m += stepMin) {
        if (isToday && m < minNow) continue;
        out.push(toHHMM(m));
      }
    }
    return out;
  }, [bk.data, bk.servico, cfg]);

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
  const overlayOpen = lightbox !== null || bookOpen;
  useEffect(() => {
    if (!overlayOpen) return;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLightbox(null); setBookOpen(false); }
      if (lightbox !== null && e.key === "ArrowRight") setLightbox((i) => (i === null ? null : (i + 1) % galeria.length));
      if (lightbox !== null && e.key === "ArrowLeft") setLightbox((i) => (i === null ? null : (i - 1 + galeria.length) % galeria.length));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
      window.removeEventListener("keydown", onKey);
    };
  }, [overlayOpen, galeria.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- booking flow (modal — a reserva acontece no fim da narrativa) ----------
  const stepsTotal = hasPros ? 5 : 4;
  const openBook = (servico?: SiteServico) => {
    if (servico) setBk((b) => ({ ...b, servico }));
    setStep(0); setErro(""); setBookOpen(true);
  };
  const dataStep = hasPros ? 2 : 1;
  const horaStep = hasPros ? 3 : 2;
  const finalStep = hasPros ? 4 : 3;
  const next = () => {
    setErro("");
    if (step === 0 && !bk.servico) return setErro("Escolha um serviço pra continuar.");
    if (hasPros && step === 1 && bk.profissional === null) return setErro("Escolha um profissional ou 'Sem preferência'.");
    if (step === dataStep && !bk.data) return setErro("Escolha uma data.");
    if (step === horaStep && !bk.hora) return setErro("Escolha um horário.");
    if (step === finalStep) return enviarWhats();
    setStep(step + 1);
  };
  const back = () => { setErro(""); setStep(Math.max(0, step - 1)); };

  const dataLabel = bk.data ? `${DOWS[bk.data.getDay()]}, ${fmtDate.format(bk.data)}` : "—";
  const waMsg = () => [
    `Olá! Quero agendar na ${cfg.nome} 💈`,
    `• Serviço: ${bk.servico?.nome}`,
    bk.profissional && bk.profissional !== "Sem preferência" ? `• Profissional: ${bk.profissional}` : null,
    `• Data: ${dataLabel}`,
    `• Horário: ${bk.hora}`,
    bk.nome ? `• Nome: ${bk.nome}` : null,
    bk.telefone ? `• Telefone: ${bk.telefone}` : null,
  ].filter(Boolean).join("\n");
  const enviarWhats = () => {
    if (!bk.nome.trim()) return setErro("Informe seu nome pra identificar o agendamento.");
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg())}`, "_blank", "noopener");
  };

  const marqueeItems = [
    ...(cfg.servicos ?? []).map((s) => s.nome),
    cfg.tagline ?? "", "Desde o primeiro corte", marca,
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
          <span className="bshop-logo-mark">{marca[0]}</span>{marca.toUpperCase()}
        </a>
        <div className="bshop-nav-links">
          {cfg.historia && <a href="#historia" onClick={anchor("#historia")}>História</a>}
          <a href="#galeria" onClick={anchor("#galeria")}>Galeria</a>
          <a href="#servicos" onClick={anchor("#servicos")}>Serviços</a>
          <a href="#contato" onClick={anchor("#contato")}>Contato</a>
          <button className="bshop-nav-cta" onClick={() => openBook()}>Agendar horário</button>
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
            {cfg.historia && <a href="#historia" onClick={anchor("#historia")}>História</a>}
            <a href="#galeria" onClick={anchor("#galeria")}>Galeria</a>
            <a href="#servicos" onClick={anchor("#servicos")}>Serviços</a>
            <a href="#contato" onClick={anchor("#contato")}>Contato</a>
            <button className="bshop-mobile-cta" onClick={() => { setMenuOpen(false); openBook(); }}>Agendar horário</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- HERO ---------- */}
      <header className="bshop-hero" id="top">
        <div className="bshop-hero-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cfg.fotos.hero && <img ref={heroImgRef} src={cfg.fotos.hero} alt={`${cfg.nome} — equipe e ambiente`} />}
        </div>
        <div className="bshop-hero-content bshop-wrap">
          <div className="bshop-hero-main">
          <motion.span className="bshop-eyebrow"
            initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}>
            {cfg.cidade ?? "Barbearia"}
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
                  {cfg.avaliacoes.nota.toFixed(1)} · {cfg.avaliacoes.total} avaliações no {cfg.avaliacoes.fonte}
                </span>
              )}
              <p className="bshop-hero-desc">
                Escolha seu serviço, seu horário e confirme direto pelo WhatsApp. Sem app, sem cadastro — do jeito que deve ser.
              </p>
            </motion.div>
            <motion.div className="bshop-hero-actions"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.9, ease: EASE }}>
              <Magnetic>
                <button className="bshop-btn bshop-btn-primary" onClick={() => openBook()}>
                  <Scissors size={16} /> Agendar meu horário
                </button>
              </Magnetic>
              <Magnetic>
                <a className="bshop-btn bshop-btn-ghost" href="#historia" onClick={anchor("#historia")}>Nossa história</a>
              </Magnetic>
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
              <img src={cfg.fotos.hero} alt={`Equipe da ${cfg.nome}`} />
              <figcaption className="bshop-hero-photo-cap">
                {cfg.avaliacoes && <span className="stars">★★★★★ {cfg.avaliacoes.nota.toFixed(1)}</span>}
                <span>A equipe · {cfg.cidade ?? cfg.nome}</span>
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
                  <FadeUp y={16}><span className="bshop-eyebrow">Nossa história</span></FadeUp>
                  <h2 className="bshop-h2"><RevealText text={cfg.historia?.titulo ?? "De onde viemos"} /></h2>
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
                <FadeUp y={14}><span className="bshop-eyebrow bshop-eyebrow-solo">Nos reels</span></FadeUp>
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
        <section className="bshop-corridor" aria-label="Fotos da barbearia em movimento">
          <ImageStreamHero
            images={galeria.map((src, i) => ({ src, alt: `${cfg.nome} — foto ${i + 1}` }))}
            cards={9}
            speed={22}
            className="bshop-corridor-stream">
            <div className="bshop-corridor-overlay">
              <FadeUp><span className="bshop-eyebrow">O dia a dia</span></FadeUp>
              <h2 className="bshop-corridor-title">
                <RevealText text="Cada corte conta" /> <em><RevealText text="uma história" delay={0.3} /></em>
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
              <FadeUp y={16}><span className="bshop-eyebrow">Galeria</span></FadeUp>
              <h2 className="bshop-h2"><RevealText text="Por dentro da" /> <em><RevealText text={marca} delay={0.25} /></em></h2>
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
                    <span>{cfg.nome}</span><small>Foto {i + 1} · ampliar</small>
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
            <FadeUp y={16}><span className="bshop-eyebrow">Serviços</span></FadeUp>
            <h2 className="bshop-h2">
              <RevealText text="O que a gente faz" /> <em><RevealText text="de melhor" delay={0.25} /></em>
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
                    {s.preco ? <strong>{fmtMoney.format(s.preco)}</strong> : <span className="ask">Valor no balcão</span>}
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
              <FadeUp y={16}><span className="bshop-eyebrow">A experiência</span></FadeUp>
              <h2 className="bshop-h2"><RevealText text="Cada detalhe" /> <em><RevealText text="conta" delay={0.25} /></em></h2>
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
                <small>{cfg.avaliacoes.total} avaliações reais no {cfg.avaliacoes.fonte}</small>
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
            <FadeUp y={16}><span className="bshop-eyebrow">Onde estamos</span></FadeUp>
            <h2 className="bshop-h2"><RevealText text="Passa" /> <em><RevealText text="aqui" delay={0.25} /></em></h2>
          </div>
          <div className="bshop-contact">
            <FadeUp delay={0}>
              <Spotlight className="bshop-contact-card">
                <h3><MapPin size={17} /> Endereço</h3>
                <p>{cfg.contato.endereco}</p>
                {cfg.contato.mapsUrl && (
                  <div className="bshop-contact-links">
                    <a href={cfg.contato.mapsUrl} target="_blank" rel="noopener">Abrir no Google Maps <ArrowRight size={13} /></a>
                  </div>
                )}
              </Spotlight>
            </FadeUp>
            {(cfg.horariosLabel?.length ?? 0) > 0 && (
              <FadeUp delay={0.1}>
                <Spotlight className="bshop-contact-card">
                  <h3><CalendarDays size={17} /> Horários</h3>
                  {(cfg.horariosLabel ?? []).map(([d, h]) => (
                    <div key={d} className="hours-line"><span>{d}</span><strong>{h}</strong></div>
                  ))}
                </Spotlight>
              </FadeUp>
            )}
            <FadeUp delay={0.2}>
              <Spotlight className="bshop-contact-card">
                <h3><Phone size={17} /> Contato</h3>
                {cfg.contato.telefone && <p>{cfg.contato.telefone}</p>}
                <div className="bshop-contact-links">
                  {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener"><MessageCircle size={14} /> Chamar no WhatsApp</a>}
                  {cfg.contato.instagram && <a href={`https://instagram.com/${cfg.contato.instagram}`} target="_blank" rel="noopener"><Instagram size={14} /> @{cfg.contato.instagram}</a>}
                  {cfg.contato.telefone && <a href={`tel:${cfg.contato.telefone.replace(/\D/g, "")}`}><Phone size={14} /> Ligar agora</a>}
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
              <FadeUp y={16}><span className="bshop-eyebrow">Dúvidas</span></FadeUp>
              <h2 className="bshop-h2"><RevealText text="Perguntas" /> <em><RevealText text="frequentes" delay={0.25} /></em></h2>
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
            <h2 className="bshop-footer-h2">Bora renovar<br />o <em>visual?</em></h2>
            <div className="bshop-footer-pills">
              <Magnetic><button className="bshop-pill primary" onClick={() => openBook()}><Scissors size={15} /> Agendar agora</button></Magnetic>
              {waNumber && <Magnetic><a className="bshop-pill" href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener"><MessageCircle size={15} /> WhatsApp</a></Magnetic>}
              {cfg.contato.mapsUrl && <Magnetic><a className="bshop-pill" href={cfg.contato.mapsUrl} target="_blank" rel="noopener"><MapPin size={15} /> Como chegar</a></Magnetic>}
              {cfg.contato.instagram && <Magnetic><a className="bshop-pill" href={`https://instagram.com/${cfg.contato.instagram}`} target="_blank" rel="noopener"><Instagram size={15} /> Instagram</a></Magnetic>}
            </div>
          </div>

          <div className="bshop-footer-bar">
            <small>© {new Date().getFullYear()} {cfg.nome} · Todos os direitos</small>
            <div className="bshop-pill bshop-footer-craft">
              <small>Feito com</small><span className="bshop-heart">♥</span><small>por</small><strong>SeekerAi</strong>
            </div>
            <Magnetic>
              <button className="bshop-pill bshop-footer-top" aria-label="Voltar ao topo"
                onClick={() => (lenisRef.current ? lenisRef.current.scrollTo(0) : window.scrollTo({ top: 0, behavior: "smooth" }))}>
                <ArrowUp size={17} />
              </button>
            </Magnetic>
          </div>
        </footer>
      </div>

      {/* ---------- WhatsApp flutuante ---------- */}
      {waNumber && (
        <a className="bshop-wa-float" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Olá! Vim pelo site da ${cfg.nome} 💈`)}`}
          target="_blank" rel="noopener" aria-label="Chamar no WhatsApp">
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
                <button className="bshop-modal-close" aria-label="Fechar" onClick={() => setBookOpen(false)}><X size={17} /></button>
                <div className="bshop-book-modal-head">
                  <span className="bshop-eyebrow">Agendamento</span>
                  <h2 className="bshop-modal-h2">Reserve em <em>30 segundos</em></h2>
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
                        <h3 className="bshop-step-title">1. Escolha o serviço</h3>
                        <div className="bshop-pick-grid">
                          {cfg.servicos.map((s) => (
                            <button key={s.nome} className={`bshop-pick${bk.servico?.nome === s.nome ? " on" : ""}`}
                              onClick={() => setBk((b) => ({ ...b, servico: s, hora: null }))}>
                              <strong>{s.nome}</strong>
                              <small>{s.duracaoMin ? `~${s.duracaoMin} min` : ""}{s.preco ? ` · ${fmtMoney.format(s.preco)}` : ""}</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {hasPros && step === 1 && (
                      <>
                        <h3 className="bshop-step-title">2. Escolha o profissional</h3>
                        <div className="bshop-pick-grid">
                          <button className={`bshop-pick${bk.profissional === "Sem preferência" ? " on" : ""}`}
                            onClick={() => setBk((b) => ({ ...b, profissional: "Sem preferência" }))}>
                            <strong>Sem preferência</strong><small>Primeiro disponível</small>
                          </button>
                          {pros.map((p) => (
                            <button key={p.nome} className={`bshop-pick${bk.profissional === p.nome ? " on" : ""}`}
                              onClick={() => setBk((b) => ({ ...b, profissional: p.nome }))}>
                              <strong>{p.nome}</strong><small>{p.especialidade ?? "Barbeiro"}</small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {step === dataStep && (
                      <>
                        <h3 className="bshop-step-title">{hasPros ? "3" : "2"}. Escolha a data</h3>
                        <div className="bshop-days">
                          {dias.map(({ d, aberto }) => (
                            <button key={d.toISOString()} disabled={!aberto}
                              className={`bshop-day${bk.data?.toDateString() === d.toDateString() ? " on" : ""}${aberto ? "" : " off"}`}
                              onClick={() => aberto && setBk((b) => ({ ...b, data: d, hora: null }))}>
                              <div className="dow">{DOWS[d.getDay()]}</div>
                              <div className="num">{d.getDate()}</div>
                              <div className="mon">{fmtDate.format(d).split(" ")[2] ?? ""}</div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {step === horaStep && (
                      <>
                        <h3 className="bshop-step-title">{hasPros ? "4" : "3"}. Escolha o horário</h3>
                        {slots.length === 0
                          ? <p className="bshop-book-error">Sem horários livres nesse dia — escolhe outra data.</p>
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
                        <h3 className="bshop-step-title">{hasPros ? "5" : "4"}. Confirme no WhatsApp</h3>
                        <dl className="bshop-summary">
                          <div><dt>Serviço</dt><dd>{bk.servico?.nome}{bk.servico?.preco ? ` — ${fmtMoney.format(bk.servico.preco)}` : ""}</dd></div>
                          {bk.profissional && bk.profissional !== "Sem preferência" && <div><dt>Profissional</dt><dd>{bk.profissional}</dd></div>}
                          <div><dt>Data</dt><dd>{dataLabel}</dd></div>
                          <div><dt>Horário</dt><dd>{bk.hora}</dd></div>
                        </dl>
                        <div className="bshop-field">
                          <label htmlFor="bk-nome">Seu nome</label>
                          <input id="bk-nome" value={bk.nome} onChange={(e) => setBk((b) => ({ ...b, nome: e.target.value }))} placeholder="Como te chamamos?" />
                        </div>
                        <div className="bshop-field">
                          <label htmlFor="bk-tel">Seu WhatsApp (opcional)</label>
                          <input id="bk-tel" type="tel" value={bk.telefone} onChange={(e) => setBk((b) => ({ ...b, telefone: e.target.value }))} placeholder="(21) 90000-0000" />
                        </div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>

                {erro && <p className="bshop-book-error">{erro}</p>}
                <div className="bshop-book-actions">
                  {step > 0
                    ? <button className="bshop-btn-back" onClick={back}><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> Voltar</button>
                    : <span />}
                  <button className="bshop-btn bshop-btn-primary" onClick={next}>
                    {step === finalStep ? <><MessageCircle size={15} /> Enviar no WhatsApp</> : <>Continuar <ArrowRight size={15} /></>}
                  </button>
                </div>
                <p className="bshop-book-msg">A mensagem é montada com suas escolhas — é só enviar e a gente confirma na hora.</p>
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
              <motion.img src={galeria[lightbox]} alt={`${cfg.nome} — foto ${lightbox + 1}`}
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                onClick={(e) => e.stopPropagation()} />
              <span className="bshop-lightbox-cap">{cfg.nome} · {lightbox + 1}/{galeria.length}</span>
              {galeria.length > 1 && (
                <>
                  <button className="bshop-lightbox-nav prev" aria-label="Anterior"
                    onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + galeria.length) % galeria.length); }}>
                    <ArrowLeft size={18} />
                  </button>
                  <button className="bshop-lightbox-nav next" aria-label="Próxima"
                    onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % galeria.length); }}>
                    <ArrowRight size={18} />
                  </button>
                </>
              )}
              <button className="bshop-lightbox-close" aria-label="Fechar" onClick={() => setLightbox(null)}><X size={18} /></button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/* Card de vídeo com overlay de play estilizado.
   `tall` = formato reel 9:16 grande (destaque da história);
   `reel` = formato compacto pra esteira horizontal. */
function VideoCard({ v, tall, reel }: {
  v: { src: string; titulo: string; descricao?: string };
  tall?: boolean; reel?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <div className={`bshop-video${tall ? " tall" : ""}${reel ? " reel" : ""}`}>
      <div className="bshop-video-frame">
        <video ref={videoRef} src={v.src} controls={playing} playsInline preload="metadata"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
        {!playing && (
          <button className="bshop-video-play" aria-label={`Assistir: ${v.titulo}`}
            onClick={() => videoRef.current?.play()}>
            <span className="bshop-video-playbtn"><Play size={reel ? 18 : 22} fill="currentColor" /></span>
          </button>
        )}
      </div>
      <div className="bshop-video-info">
        <strong>{v.titulo}</strong>
        {v.descricao && !reel && <p>{v.descricao}</p>}
      </div>
    </div>
  );
}

/* Contador animado da nota (5.0) */
function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) { if (el) el.textContent = to.toFixed(1); return; }
    const obj = { v: 0 };
    const tween = gsap.to(obj, {
      v: to, duration: 1.6, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
      onUpdate: () => { el.textContent = obj.v.toFixed(1); },
    });
    return () => { tween.kill(); };
  }, [to, reduced]);
  return <span ref={ref}>0.0</span>;
}
