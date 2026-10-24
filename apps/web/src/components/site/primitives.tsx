"use client";

/* Primitivos compartilhados dos sites premium (/site/<slug>).
   Usados por barbershop-site.tsx (.bshop) e beauty-site.tsx (.bbeauty).
   Classes CSS aceitam prefixo `ns` pra cada tema aplicar o seu. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion } from "framer-motion";
import { gsap } from "gsap";
import { Play } from "lucide-react";
import type { SiteConfig, SiteServico } from "@/lib/sites";

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const DOWS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const fmtDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
export const fmtMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function toMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
export function toHHMM(min: number) { return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }

/* ----------------------------------------------------------------------
   MagneticButton — primitivo portado de 21st.dev/@jahed/motion-footer
---------------------------------------------------------------------- */
export function Magnetic({ children, className = "", strength = 0.4 }: {
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

  return <div ref={ref} className={`${className}`} style={{ transformStyle: "preserve-3d" }}>{children}</div>;
}

/* Text reveal palavra a palavra (blur + rise) — padrão 21st.dev text-reveal */
export function RevealText({ text, className = "", delay = 0, once = true }: {
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
export function FadeUp({ children, className = "", delay = 0, y = 28 }: {
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

/* Card com spotlight que segue o cursor */
export function Spotlight({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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

/* Contador animado (ex.: nota 5.0) — dispara quando o elemento entra
   na viewport (useInView é mais confiável que ScrollTrigger no mobile). */
export function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.6 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) { el.textContent = to.toFixed(1); return; }
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 1.6, ease: EASE,
      onUpdate: (v) => { el.textContent = v.toFixed(1); },
    });
    return () => controls.stop();
  }, [inView, to, reduced]);
  return <span ref={ref}>0.0</span>;
}

/* Card de vídeo com overlay de play. `ns` = prefixo do tema (bshop/bbeauty). */
export function VideoCard({ v, tall, reel, ns = "bshop" }: {
  v: { src: string; titulo: string; descricao?: string };
  tall?: boolean; reel?: boolean; ns?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <div className={`${ns}-video${tall ? " tall" : ""}${reel ? " reel" : ""}`}>
      <div className={`${ns}-video-frame`}>
        {/* #t=0.08: o browser mostra o frame de ~80ms como poster —
            sem isso o card fica preto até os metadados carregarem. */}
        <video ref={videoRef} src={`${v.src}#t=0.08`} controls={playing} playsInline preload="metadata"
          onLoadedMetadata={(e) => { const v2 = e.currentTarget; if (v2.currentTime === 0) v2.currentTime = 0.08; }}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
        {!playing && (
          <button className={`${ns}-video-play`} aria-label={`Assistir: ${v.titulo}`}
            onClick={() => videoRef.current?.play()}>
            <span className={`${ns}-video-playbtn`}><Play size={reel ? 18 : 22} fill="currentColor" /></span>
          </button>
        )}
      </div>
      <div className={`${ns}-video-info`}>
        <strong>{v.titulo}</strong>
        {v.descricao && !reel && <p>{v.descricao}</p>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------
   useBooking — lógica do fluxo de agendamento → WhatsApp.
   Cada tema renderiza o modal com o próprio estilo; os passos são os mesmos:
   serviço → (profissional) → data → horário → dados + confirmação.
---------------------------------------------------------------------- */
export interface Booking {
  servico: SiteServico | null;
  profissional: string | null;
  data: Date | null;
  hora: string | null;
  nome: string;
  telefone: string;
}

export function useBooking(cfg: SiteConfig) {
  const [bookOpen, setBookOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [bk, setBk] = useState<Booking>({ servico: null, profissional: null, data: null, hora: null, nome: "", telefone: "" });
  const [erro, setErro] = useState("");

  const waNumber = (cfg.contato.whatsapp ?? cfg.contato.telefone ?? "").replace(/\D/g, "");
  const pros = cfg.profissionais ?? [];
  const hasPros = pros.length > 0;

  const dias = useMemo(() => {
    const out: { d: Date; aberto: boolean }[] = [];
    const now = new Date();
    for (let i = 0; i < (cfg.booking.diasFuturos || 14); i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      out.push({ d, aberto: Boolean(cfg.horarios?.[String(d.getDay())]?.length) });
    }
    return out;
  }, [cfg]);

  const slots = useMemo(() => {
    if (!bk.data) return [];
    const janelas = cfg.horarios?.[String(bk.data.getDay())] ?? [];
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

  const stepsTotal = hasPros ? 5 : 4;
  const dataStep = hasPros ? 2 : 1;
  const horaStep = hasPros ? 3 : 2;
  const finalStep = hasPros ? 4 : 3;

  const openBook = useCallback((servico?: SiteServico) => {
    if (servico) setBk((b) => ({ ...b, servico }));
    setStep(0); setErro(""); setBookOpen(true);
  }, []);

  const dataLabel = bk.data ? `${DOWS[bk.data.getDay()]}, ${fmtDate.format(bk.data)}` : "—";
  const waMsg = () => [
    `Olá! Quero agendar no ${cfg.nome} ✨`,
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

  return {
    bookOpen, setBookOpen, step, bk, setBk, erro, waNumber,
    pros, hasPros, dias, slots, stepsTotal, dataStep, horaStep, finalStep,
    openBook, next, back, dataLabel,
  };
}

/* Scroll-lock + Escape/ArrowKeys compartilhado por lightbox e modal */
export function useOverlayLock(open: boolean, opts?: {
  onEscape?: () => void;
  lightbox?: { index: number | null; total: number; go: (i: number) => void };
}) {
  const { onEscape, lightbox } = opts ?? {};
  useEffect(() => {
    if (!open) return;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape?.();
      if (lightbox && lightbox.index !== null) {
        if (e.key === "ArrowRight") lightbox.go((lightbox.index + 1) % lightbox.total);
        if (e.key === "ArrowLeft") lightbox.go((lightbox.index - 1 + lightbox.total) % lightbox.total);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onEscape, lightbox]);
}
