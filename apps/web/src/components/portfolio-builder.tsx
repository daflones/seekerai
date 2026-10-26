"use client";
/* eslint-disable @next/next/no-img-element */
/* Imagens são data URLs enviadas pelo usuário — next/image não as otimiza. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ExternalLink, ImagePlus, Loader2, Lock, MessageCircle, Star } from "lucide-react";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { toE164 } from "@/lib/phone";

interface Trabalho { nome: string; descricao: string; resultado: string; foto: string | null }
export interface PortfolioData {
  slug?: string;
  nome: string;
  profissao: string;
  audiencia: string;
  diferencial: string;
  whatsapp: string;
  instagram: string;
  foto_url: string | null;
  trabalhos: Trabalho[];
  prova: { clientes: string; anos: string; nota: string; depoimento: string; autor: string };
  tema: "padrao" | "tecnologico" | "bento";
  publicado: boolean;
}

type PfT = Messages["portfolio"];

const TEMAS: { id: PortfolioData["tema"]; pro: boolean }[] = [
  { id: "padrao", pro: false },
  { id: "tecnologico", pro: true },
  { id: "bento", pro: true },
];

const STEP_COUNT = 9;

function readImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 480 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const out = canvas.toDataURL("image/jpeg", 0.82);
      resolve(out.length < 400_000 ? out : null);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export function PortfolioBuilder({ initial, pro, appUrl, t }: { initial: PortfolioData | null; pro: boolean; appUrl: string; t?: PfT }) {
  const tt = t ?? getMessages("pt").portfolio;
  const [data, setData] = useState<PortfolioData>(initial ?? {
    nome: "", profissao: "", audiencia: "", diferencial: "", whatsapp: "", instagram: "",
    foto_url: null, trabalhos: [], prova: { clientes: "", anos: "", nota: "", depoimento: "", autor: "" },
    tema: "padrao", publicado: false,
  });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  // Quem já tem portfólio vê o resumo dele primeiro — o wizard só abre ao editar.
  const [editing, setEditing] = useState(!initial);

  const set = <K extends keyof PortfolioData>(key: K, value: PortfolioData[K]) => setData((d) => ({ ...d, [key]: value }));
  const initials = data.nome.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "S";
  const publicUrl = data.slug ? `${appUrl}/p/${data.slug}` : "";
  const optional = [2, 3, 4, 7].includes(step);
  const canContinue = step === 0 ? data.nome.trim().length >= 2 : true;

  const preview = useMemo(() => <PortfolioPreview data={data} initials={initials} t={tt} />, [data, initials, tt]);

  async function save(publicado: boolean) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, publicado }),
      });
      const out = (await res.json().catch(() => null)) as { slug?: string; error?: string } | null;
      if (!res.ok) { setError(out?.error ?? tt.errSave); setSaving(false); return; }
      setData((d) => ({ ...d, slug: out?.slug ?? d.slug, publicado }));
      setDone(true);
      setEditing(false);
    } catch {
      setError(tt.errNet);
    }
    setSaving(false);
  }

  async function pickImage(file: File | undefined, target: "foto" | number) {
    if (!file) return;
    const base64 = await readImage(file);
    if (!base64) { setError(tt.errImg); return; }
    if (target === "foto") set("foto_url", base64);
    else set("trabalhos", data.trabalhos.map((tr, i) => (i === target ? { ...tr, foto: base64 } : tr)));
  }

  if (done) return <div className="pf-done">
    <Check size={30} />
    <h2>{tt.doneT1} {data.publicado ? tt.doneLive : tt.doneSaved}<span className="gradient-text">.</span></h2>
    <p>{data.publicado ? tt.doneP1 : tt.doneP2}</p>
    {data.publicado && publicUrl && <code className="pf-url">{publicUrl}</code>}
    <div className="pf-done-actions">
      {data.publicado && publicUrl && <Link className="button button-primary" href={`/p/${data.slug}`} target="_blank">{tt.open} <ExternalLink size={14} /></Link>}
      <button className="button button-glass" onClick={() => { setDone(false); setEditing(true); setStep(8); }}>{tt.edit}</button>
      {!data.publicado && <button className="button button-primary" onClick={() => void save(true)}>{tt.publishNow}</button>}
      <Link className="text-link" href="/app">{tt.backDash}</Link>
    </div>
  </div>;

  const next = () => setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // Portfólio já criado: mostra o card dele com status, link e ações.
  if (!editing) return <div className="pf-existing">
    <div className="pf-existing-head">
      <span className="pf-photo-avatar">{data.foto_url ? <img src={data.foto_url} alt="" /> : initials}</span>
      <div>
        <h2>{data.nome || tt.yourPf}</h2>
        <p className="pf-hint">{data.profissao || tt.noDesc}</p>
        <span className={`pf-status ${data.publicado ? "pf-status-on" : ""}`}>
          {data.publicado ? tt.pub : tt.draft}
        </span>
      </div>
    </div>
    {data.publicado && publicUrl && <code className="pf-url">{publicUrl}</code>}
    <div className="pf-existing-preview">{preview}</div>
    <div className="pf-done-actions">
      {data.publicado && publicUrl && <Link className="button button-primary" href={`/p/${data.slug}`} target="_blank">{tt.open} <ExternalLink size={14} /></Link>}
      <button className="button button-glass" onClick={() => { setEditing(true); setStep(0); }}>{tt.editPf}</button>
      {!data.publicado && <button className="button button-primary" onClick={() => void save(true)} disabled={saving}>
        {saving ? tt.publishing : tt.publishNow}
      </button>}
    </div>
  </div>;

  return <div className="pf-wizard">
    {initial && (
      <button type="button" className="text-link pf-back" onClick={() => setEditing(false)}>{tt.viewMine}</button>
    )}
    <div className="pf-progress"><i style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }} /><span>{step + 1} / {STEP_COUNT}</span></div>

    {step < 8 ? <div className="pf-step">
      {step === 0 && <>
        <h2>{tt.s0t}</h2>
        <p className="pf-hint">{tt.s0h}</p>
        <input className="pf-input" value={data.nome} onChange={(e) => set("nome", e.target.value)} maxLength={120} autoFocus placeholder={tt.s0ph} />
      </>}
      {step === 1 && <>
        <h2>{tt.s1t}</h2>
        <p className="pf-hint">{tt.s1h}</p>
        <input className="pf-input" value={data.profissao} onChange={(e) => set("profissao", e.target.value)} maxLength={140} placeholder={tt.s1ph} />
        <div className="pf-chips">{tt.profissoes.map((p) => <button key={p} type="button" className={data.profissao === p ? "selected" : ""} onClick={() => set("profissao", p)}>{p}</button>)}</div>
      </>}
      {step === 2 && <>
        <h2>{tt.s2t}</h2>
        <p className="pf-hint">{tt.s2h}</p>
        <input className="pf-input" value={data.audiencia} onChange={(e) => set("audiencia", e.target.value)} maxLength={140} placeholder={tt.s2ph} />
        <div className="pf-chips">{tt.audiencias.map((a) => <button key={a} type="button" className={data.audiencia === a ? "selected" : ""} onClick={() => set("audiencia", a)}>{a}</button>)}</div>
      </>}
      {step === 3 && <>
        <h2>{tt.s3t}</h2>
        <p className="pf-hint">{tt.s3h}</p>
        <input className="pf-input" value={data.diferencial} onChange={(e) => set("diferencial", e.target.value)} maxLength={300} placeholder={tt.s3ph} />
      </>}
      {step === 4 && <>
        <h2>{tt.s4t}</h2>
        <p className="pf-hint">{tt.s4h}</p>
        <label className="pf-photo">
          <span className="pf-photo-avatar">{data.foto_url ? <img src={data.foto_url} alt="" /> : initials}</span>
          <span>{tt.s4ph}</span>
          <input type="file" accept="image/*" hidden onChange={(e) => void pickImage(e.target.files?.[0], "foto")} />
        </label>
      </>}
      {step === 5 && <>
        <h2>{tt.s5t}</h2>
        <p className="pf-hint">{tt.s5h}</p>
        <input className="pf-input" value={data.whatsapp} onChange={(e) => set("whatsapp", e.target.value.replace(/[^\d]/g, ""))} maxLength={15} inputMode="numeric" placeholder={tt.s5ph} />
        <input className="pf-input" value={data.instagram} onChange={(e) => set("instagram", e.target.value)} maxLength={80} placeholder={tt.s5ig} />
      </>}
      {step === 6 && <>
        <h2>{tt.s6t}</h2>
        <p className="pf-hint">{tt.s6h}</p>
        {data.trabalhos.map((tr, i) => (
          <div key={i} className="pf-work">
            <span className="pf-work-tag">{tt.s6w} {i + 1}</span>
            <input value={tr.nome} onChange={(e) => set("trabalhos", data.trabalhos.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} maxLength={120} placeholder={tt.s6name} />
            <input value={tr.descricao} onChange={(e) => set("trabalhos", data.trabalhos.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))} maxLength={200} placeholder={tt.s6desc} />
            <input value={tr.resultado} onChange={(e) => set("trabalhos", data.trabalhos.map((x, j) => j === i ? { ...x, resultado: e.target.value } : x))} maxLength={120} placeholder={tt.s6res} />
            <label className="pf-work-photo">{tr.foto ? <img src={tr.foto} alt="" /> : <><ImagePlus size={18} /><small>{tt.s6add}</small></>}
              <input type="file" accept="image/*" hidden onChange={(e) => void pickImage(e.target.files?.[0], i)} />
            </label>
          </div>
        ))}
        {data.trabalhos.length < 3 && (
          <button type="button" className="button button-glass pf-add" onClick={() => set("trabalhos", [...data.trabalhos, { nome: "", descricao: "", resultado: "", foto: null }])}>
            {tt.s6new} {data.trabalhos.length ? tt.s6other : ""}{tt.s6work}
          </button>
        )}
      </>}
      {step === 7 && <>
        <h2>{tt.s7t}</h2>
        <p className="pf-hint">{tt.s7h}</p>
        <div className="pf-proof">
          <div className="pf-proof-row">
            <input value={data.prova.clientes} onChange={(e) => set("prova", { ...data.prova, clientes: e.target.value })} maxLength={20} placeholder="50+" />
            <input value={data.prova.nota} onChange={(e) => set("prova", { ...data.prova, nota: e.target.value })} maxLength={10} placeholder="5★" />
            <input value={data.prova.anos} onChange={(e) => set("prova", { ...data.prova, anos: e.target.value })} maxLength={20} placeholder="2 anos" />
          </div>
          <input value={data.prova.depoimento} onChange={(e) => set("prova", { ...data.prova, depoimento: e.target.value })} maxLength={280} placeholder={tt.s7praise} />
          <input value={data.prova.autor} onChange={(e) => set("prova", { ...data.prova, autor: e.target.value })} maxLength={80} placeholder={tt.s7who} />
        </div>
      </>}

      {error && <p role="alert" className="auth-error">{error}</p>}
      <div className="pf-nav">
        {step > 0 && <button type="button" className="button button-glass" onClick={back}><ArrowLeft size={15} />{tt.back}</button>}
        <button type="button" className="button button-primary" disabled={!canContinue} onClick={next}>
          {tt.next} <ArrowRight size={15} />
        </button>
        {optional && <button type="button" className="text-link" onClick={next}>{tt.skip}</button>}
      </div>
    </div> : <div className="pf-step pf-final">
      <div className="pf-themes">
        <h2>{tt.s8t}</h2>
        <p className="pf-hint">{tt.s8h}</p>
        {TEMAS.map((tema) => {
          const locked = tema.pro && !pro;
          const [nome, descricao] = tt.themes[tema.id];
          return <button key={tema.id} type="button" className={`pf-theme${data.tema === tema.id ? " selected" : ""}`} disabled={locked}
            onClick={() => set("tema", tema.id)}>
            <strong>{nome}</strong><small>{descricao}</small>
            {locked ? <span className="pf-pro"><Lock size={11} /> {tt.proOnly}</span> : data.tema === tema.id && <Check size={15} />}
          </button>;
        })}
        {error && <p role="alert" className="auth-error">{error}</p>}
        <div className="pf-nav">
          <button type="button" className="button button-glass" onClick={back}><ArrowLeft size={15} />{tt.back}</button>
          <button type="button" className="button button-primary" disabled={saving} onClick={() => void save(true)}>
            {saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />}{tt.savePub}
          </button>
          <button type="button" className="text-link" disabled={saving} onClick={() => void save(false)}>{tt.saveDraft}</button>
        </div>
      </div>
      <div className="pf-preview-wrap">{preview}</div>
    </div>}
  </div>;
}

export function PortfolioPreview({ data, initials, t }: { data: PortfolioData; initials: string; t?: PfT }) {
  const tt = t ?? getMessages("pt").portfolio;
  const temaClass = `pf-view pf-theme-${data.tema}`;
  return <div className={temaClass}>
    <span className="pf-view-badge">{tt.made}</span>
    <div className="pf-view-hero">
      <span className="pf-view-avatar">{data.foto_url ? <img src={data.foto_url} alt={data.nome} /> : initials}</span>
      <h3>{data.nome || tt.yourName}</h3>
      <small>{data.profissao || tt.yourService}</small>
      <p>{[data.audiencia && `${tt.help} ${data.audiencia}`, data.diferencial].filter(Boolean).join(". ")}</p>
      <div className="pf-view-actions">
        {data.whatsapp && <a className="pf-view-wpp" href={`https://wa.me/${toE164(data.whatsapp) ?? data.whatsapp}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />{tt.wa}</a>}
        {data.instagram && <span className="pf-view-ig">{data.instagram.startsWith("@") ? data.instagram : `@${data.instagram}`}</span>}
      </div>
    </div>
    {(data.prova.clientes || data.prova.nota || data.prova.anos) && (
      <div className="pf-view-stats">
        {data.prova.clientes && <div><strong>{data.prova.clientes}</strong><small>{tt.clients}</small></div>}
        {data.prova.nota && <div><strong>{data.prova.nota}<Star size={11} /></strong><small>{tt.rating}</small></div>}
        {data.prova.anos && <div><strong>{data.prova.anos}</strong><small>{tt.years}</small></div>}
      </div>
    )}
    {data.prova.depoimento && <blockquote className="pf-view-quote">“{data.prova.depoimento}”{data.prova.autor && <cite>— {data.prova.autor}</cite>}</blockquote>}
    {data.trabalhos.length > 0 && <div className="pf-view-works">
      <small>{tt.works}</small>
      {data.trabalhos.map((tr, i) => <div key={i} className="pf-view-work">
        {tr.foto && <img src={tr.foto} alt="" />}
        <strong>{tr.nome}</strong>
        {tr.descricao && <p>{tr.descricao}</p>}
        {tr.resultado && <span>{tr.resultado}</span>}
      </div>)}
    </div>}
  </div>;
}
