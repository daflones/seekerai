"use client";
/* eslint-disable @next/next/no-img-element */
/* Imagens são data URLs enviadas pelo usuário — next/image não as otimiza. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ExternalLink, ImagePlus, Loader2, Lock, MessageCircle, Star } from "lucide-react";

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

const PROFISSOES = ["Criação de sites", "Social media", "Design gráfico", "Tráfego pago", "Fotografia", "Edição de vídeo", "Consultoria", "Marketing digital"];
const AUDIENCIAS = ["negócios locais", "pequenas empresas", "lojas e comércios", "profissionais autônomos", "restaurantes", "clínicas e consultórios"];
const TEMAS: { id: PortfolioData["tema"]; nome: string; descricao: string; pro: boolean }[] = [
  { id: "padrao", nome: "Padrão", descricao: "Moderno e direto", pro: false },
  { id: "tecnologico", nome: "Tecnológico", descricao: "Grid neon e detalhes técnicos", pro: true },
  { id: "bento", nome: "Bento", descricao: "Blocos tipo vitrine", pro: true },
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

export function PortfolioBuilder({ initial, pro, appUrl }: { initial: PortfolioData | null; pro: boolean; appUrl: string }) {
  const [data, setData] = useState<PortfolioData>(initial ?? {
    nome: "", profissao: "", audiencia: "", diferencial: "", whatsapp: "", instagram: "",
    foto_url: null, trabalhos: [], prova: { clientes: "", anos: "", nota: "", depoimento: "", autor: "" },
    tema: "padrao", publicado: false,
  });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const set = <K extends keyof PortfolioData>(key: K, value: PortfolioData[K]) => setData((d) => ({ ...d, [key]: value }));
  const initials = data.nome.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "S";
  const publicUrl = data.slug ? `${appUrl}/p/${data.slug}` : "";
  const optional = [2, 3, 4, 7].includes(step);
  const canContinue = step === 0 ? data.nome.trim().length >= 2 : true;

  const preview = useMemo(() => <PortfolioPreview data={data} initials={initials} />, [data, initials]);

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
      if (!res.ok) { setError(out?.error ?? "Não foi possível salvar."); setSaving(false); return; }
      setData((d) => ({ ...d, slug: out?.slug ?? d.slug, publicado }));
      setDone(true);
    } catch {
      setError("Sem conexão. Tente novamente.");
    }
    setSaving(false);
  }

  async function pickImage(file: File | undefined, target: "foto" | number) {
    if (!file) return;
    const base64 = await readImage(file);
    if (!base64) { setError("Imagem muito grande. Tente uma menor."); return; }
    if (target === "foto") set("foto_url", base64);
    else set("trabalhos", data.trabalhos.map((t, i) => (i === target ? { ...t, foto: base64 } : t)));
  }

  if (done) return <div className="pf-done">
    <Check size={30} />
    <h2>Seu portfólio está {data.publicado ? "no ar" : "salvo"}<span className="gradient-text">.</span></h2>
    <p>{data.publicado ? "Mande o link junto com cada abordagem — ele fala por você." : "Ele está em rascunho. Publique quando quiser."}</p>
    {data.publicado && publicUrl && <code className="pf-url">{publicUrl}</code>}
    <div className="pf-done-actions">
      {data.publicado && publicUrl && <Link className="button button-primary" href={`/p/${data.slug}`} target="_blank">Abrir página <ExternalLink size={14} /></Link>}
      <button className="button button-glass" onClick={() => { setDone(false); setStep(8); }}>Editar na tela</button>
      {!data.publicado && <button className="button button-primary" onClick={() => void save(true)}>Publicar agora</button>}
      <Link className="text-link" href="/app">Voltar ao painel</Link>
    </div>
  </div>;

  const next = () => setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return <div className="pf-wizard">
    <div className="pf-progress"><i style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }} /><span>{step + 1} / {STEP_COUNT}</span></div>

    {step < 8 ? <div className="pf-step">
      {step === 0 && <>
        <h2>Qual é o seu nome ou da sua empresa?</h2>
        <p className="pf-hint">É o nome que vai aparecer em destaque na página.</p>
        <input className="pf-input" value={data.nome} onChange={(e) => set("nome", e.target.value)} maxLength={120} autoFocus placeholder="Seu nome ou marca" />
      </>}
      {step === 1 && <>
        <h2>O que você faz?</h2>
        <p className="pf-hint">Escreva com suas palavras ou toque numa sugestão.</p>
        <input className="pf-input" value={data.profissao} onChange={(e) => set("profissao", e.target.value)} maxLength={140} placeholder="Ex.: Criação de sites" />
        <div className="pf-chips">{PROFISSOES.map((p) => <button key={p} type="button" className={data.profissao === p ? "selected" : ""} onClick={() => set("profissao", p)}>{p}</button>)}</div>
      </>}
      {step === 2 && <>
        <h2>Pra quem você trabalha?</h2>
        <p className="pf-hint">Quem são seus clientes? Isso ajuda a página a falar direto com eles.</p>
        <input className="pf-input" value={data.audiencia} onChange={(e) => set("audiencia", e.target.value)} maxLength={140} placeholder="Ex.: negócios locais" />
        <div className="pf-chips">{AUDIENCIAS.map((a) => <button key={a} type="button" className={data.audiencia === a ? "selected" : ""} onClick={() => set("audiencia", a)}>{a}</button>)}</div>
      </>}
      {step === 3 && <>
        <h2>O que te diferencia?</h2>
        <p className="pf-hint">Uma frase sobre seu jeito de trabalhar, sua experiência ou um resultado que você entrega.</p>
        <input className="pf-input" value={data.diferencial} onChange={(e) => set("diferencial", e.target.value)} maxLength={300} placeholder="Ex.: entrego rápido e com acompanhamento" />
      </>}
      {step === 4 && <>
        <h2>Quer colocar uma foto sua?</h2>
        <p className="pf-hint">Uma foto ou o logo da sua empresa passa muito mais confiança.</p>
        <label className="pf-photo">
          <span className="pf-photo-avatar">{data.foto_url ? <img src={data.foto_url} alt="" /> : initials}</span>
          <span>Sua foto ou o logo da sua empresa</span>
          <input type="file" accept="image/*" hidden onChange={(e) => void pickImage(e.target.files?.[0], "foto")} />
        </label>
      </>}
      {step === 5 && <>
        <h2>Como os clientes falam com você?</h2>
        <p className="pf-hint">Os botões da página abrem conversa no seu WhatsApp.</p>
        <input className="pf-input" value={data.whatsapp} onChange={(e) => set("whatsapp", e.target.value.replace(/[^\d]/g, ""))} maxLength={15} inputMode="numeric" placeholder="WhatsApp com DDD — ex.: 21987654321" />
        <input className="pf-input" value={data.instagram} onChange={(e) => set("instagram", e.target.value)} maxLength={80} placeholder="@seu.instagram (opcional)" />
      </>}
      {step === 6 && <>
        <h2>Mostre alguns trabalhos</h2>
        <p className="pf-hint">Até 3 agora — dá pra adicionar mais depois.</p>
        {data.trabalhos.map((t, i) => (
          <div key={i} className="pf-work">
            <span className="pf-work-tag">Trabalho {i + 1}</span>
            <input value={t.nome} onChange={(e) => set("trabalhos", data.trabalhos.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} maxLength={120} placeholder="Nome (ex.: Site da Barbearia Central)" />
            <input value={t.descricao} onChange={(e) => set("trabalhos", data.trabalhos.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))} maxLength={200} placeholder="O que você fez (opcional)" />
            <input value={t.resultado} onChange={(e) => set("trabalhos", data.trabalhos.map((x, j) => j === i ? { ...x, resultado: e.target.value } : x))} maxLength={120} placeholder="Resultado (opcional) — ex.: +80% em vendas" />
            <label className="pf-work-photo">{t.foto ? <img src={t.foto} alt="" /> : <><ImagePlus size={18} /><small>Adicionar</small></>}
              <input type="file" accept="image/*" hidden onChange={(e) => void pickImage(e.target.files?.[0], i)} />
            </label>
          </div>
        ))}
        {data.trabalhos.length < 3 && (
          <button type="button" className="button button-glass pf-add" onClick={() => set("trabalhos", [...data.trabalhos, { nome: "", descricao: "", resultado: "", foto: null }])}>
            + Adicionar {data.trabalhos.length ? "outro " : ""}trabalho
          </button>
        )}
      </>}
      {step === 7 && <>
        <h2>Tem números ou um elogio de cliente?</h2>
        <p className="pf-hint">Isso convence muito quem visita. Preencha só o que tiver.</p>
        <div className="pf-proof">
          <div className="pf-proof-row">
            <input value={data.prova.clientes} onChange={(e) => set("prova", { ...data.prova, clientes: e.target.value })} maxLength={20} placeholder="50+" />
            <input value={data.prova.nota} onChange={(e) => set("prova", { ...data.prova, nota: e.target.value })} maxLength={10} placeholder="5★" />
            <input value={data.prova.anos} onChange={(e) => set("prova", { ...data.prova, anos: e.target.value })} maxLength={20} placeholder="2 anos" />
          </div>
          <input value={data.prova.depoimento} onChange={(e) => set("prova", { ...data.prova, depoimento: e.target.value })} maxLength={280} placeholder="Elogio (ex.: entregou antes do prazo)" />
          <input value={data.prova.autor} onChange={(e) => set("prova", { ...data.prova, autor: e.target.value })} maxLength={80} placeholder="Quem disse — ex.: Marina, Barbearia Central" />
        </div>
      </>}

      {error && <p role="alert" className="auth-error">{error}</p>}
      <div className="pf-nav">
        {step > 0 && <button type="button" className="button button-glass" onClick={back}><ArrowLeft size={15} />Voltar</button>}
        <button type="button" className="button button-primary" disabled={!canContinue} onClick={next}>
          Continuar <ArrowRight size={15} />
        </button>
        {optional && <button type="button" className="text-link" onClick={next}>Pular</button>}
      </div>
    </div> : <div className="pf-step pf-final">
      <div className="pf-themes">
        <h2>Última etapa — escolha o visual</h2>
        <p className="pf-hint">Esse é o seu portfólio já com suas respostas. Toque nos modelos pra comparar.</p>
        {TEMAS.map((t) => {
          const locked = t.pro && !pro;
          return <button key={t.id} type="button" className={`pf-theme${data.tema === t.id ? " selected" : ""}`} disabled={locked}
            onClick={() => set("tema", t.id)}>
            <strong>{t.nome}</strong><small>{t.descricao}</small>
            {locked ? <span className="pf-pro"><Lock size={11} /> Disponível no Pro</span> : data.tema === t.id && <Check size={15} />}
          </button>;
        })}
        {error && <p role="alert" className="auth-error">{error}</p>}
        <div className="pf-nav">
          <button type="button" className="button button-glass" onClick={back}><ArrowLeft size={15} />Voltar</button>
          <button type="button" className="button button-primary" disabled={saving} onClick={() => void save(true)}>
            {saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />}Salvar e publicar
          </button>
          <button type="button" className="text-link" disabled={saving} onClick={() => void save(false)}>Salvar rascunho</button>
        </div>
      </div>
      <div className="pf-preview-wrap">{preview}</div>
    </div>}
  </div>;
}

export function PortfolioPreview({ data, initials }: { data: PortfolioData; initials: string }) {
  const temaClass = `pf-view pf-theme-${data.tema}`;
  return <div className={temaClass}>
    <span className="pf-view-badge">Feito com SeekerAi</span>
    <div className="pf-view-hero">
      <span className="pf-view-avatar">{data.foto_url ? <img src={data.foto_url} alt={data.nome} /> : initials}</span>
      <h3>{data.nome || "Seu nome"}</h3>
      <small>{data.profissao || "Seu serviço"}</small>
      <p>{[data.audiencia && `Ajudo ${data.audiencia}`, data.diferencial].filter(Boolean).join(". ")}</p>
      <div className="pf-view-actions">
        {data.whatsapp && <a className="pf-view-wpp" href={`https://wa.me/${data.whatsapp}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />Falar no WhatsApp</a>}
        {data.instagram && <span className="pf-view-ig">{data.instagram.startsWith("@") ? data.instagram : `@${data.instagram}`}</span>}
      </div>
    </div>
    {(data.prova.clientes || data.prova.nota || data.prova.anos) && (
      <div className="pf-view-stats">
        {data.prova.clientes && <div><strong>{data.prova.clientes}</strong><small>clientes</small></div>}
        {data.prova.nota && <div><strong>{data.prova.nota}<Star size={11} /></strong><small>avaliação</small></div>}
        {data.prova.anos && <div><strong>{data.prova.anos}</strong><small>experiência</small></div>}
      </div>
    )}
    {data.prova.depoimento && <blockquote className="pf-view-quote">“{data.prova.depoimento}”{data.prova.autor && <cite>— {data.prova.autor}</cite>}</blockquote>}
    {data.trabalhos.length > 0 && <div className="pf-view-works">
      <small>TRABALHOS</small>
      {data.trabalhos.map((t, i) => <div key={i} className="pf-view-work">
        {t.foto && <img src={t.foto} alt="" />}
        <strong>{t.nome}</strong>
        {t.descricao && <p>{t.descricao}</p>}
        {t.resultado && <span>{t.resultado}</span>}
      </div>)}
    </div>}
  </div>;
}
