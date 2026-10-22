"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Copy, Download, ExternalLink, Eye, ImagePlus, Instagram, Loader2, MapPin,
  MessageSquareText, Phone, Sparkles, Star, Trash2, Globe, MessageCircle,
  FileText, MonitorSmartphone,
} from "lucide-react";
import { callAction, LEAD_STATUS, placeImageSrc, type LeadRow } from "@/lib/app-client";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { LeadAssistant } from "./lead-assistant";

interface OutputRow {
  id: string;
  tipo: "sales_reply" | "deep_strategy" | "generate_site" | "generate_image" | "image_prompt";
  conteudo: string;
  modelo: string | null;
  created_at: string;
}



function promptFor(tipo: string, lead: LeadRow, serviceName: string): string {
  const gap = lead.site ? "" : " O estabelecimento NÃO tem site — use isso como gancho principal.";
  switch (tipo) {
    case "sales_reply":
      return `Escreva uma mensagem curta de primeira abordagem via WhatsApp oferecendo ${serviceName} para este estabelecimento.` +
        `${gap} Tom humano, sem exageros, máximo 3 parágrafos curtos, terminando com uma pergunta simples.`;
    case "deep_strategy":
      return `Monte a estratégia de venda de ${serviceName} para este estabelecimento: diagnóstico, gaps observáveis,` +
        ` ângulo de abordagem, objeções prováveis e o próximo passo concreto.${gap}`;
    default:
      return `Crie o site institucional completo deste estabelecimento, pronto para publicar.` +
        ` Nome, categoria, endereço, telefone e avaliação estão no contexto — use-os de verdade.`;
  }
}

export function LeadWorkspace({ lead: initialLead, outputs: initialOutputs, serviceName, enabledActions, t = getMessages("pt").lead, statusLabels = getMessages("pt").leadsPage.status }: {
  lead: LeadRow;
  outputs: OutputRow[];
  serviceName: string;
  enabledActions: string[];
  t?: Messages["lead"];
  statusLabels?: Record<string, string>;
}) {
  const OUTPUT_LABEL = t.outLabels;
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [outputs, setOutputs] = useState(initialOutputs);
  const [notas, setNotas] = useState(initialLead.notas ?? "");
  const [imagePrompt, setImagePrompt] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Uma flag por ação — site pode gerar em background enquanto a pessoa
  // gera imagem, estratégia ou mensagem ao mesmo tempo.
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const isBusy = (k: string) => busy.has(k);
  function setBusyKey(k: string, on: boolean) {
    setBusy((cur) => {
      const next = new Set(cur);
      if (on) next.add(k); else next.delete(k);
      return next;
    });
  }
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canSite = enabledActions.includes("generate_site");
  const siteCheck = (lead as LeadRow & {
    dados?: { siteCheck?: { estado?: string; sinais?: string[] } | null } | null;
  }).dados?.siteCheck ?? null;
  const siteCheckLabel = siteCheck?.estado === "desatualizado" ? t.labels.siteOld
    : siteCheck?.estado === "fora" ? t.labels.siteOut
    : siteCheck?.estado === "bom" ? t.labels.siteBom
    : siteCheck?.estado === "ok" ? t.labels.siteComum : null;
  const canImage = enabledActions.includes("generate_image");
  const waDigits = (lead.telefone ?? "").replace(/\D/g, "");
  const waLink = waDigits ? `https://wa.me/${waDigits.startsWith("55") ? waDigits : `55${waDigits}`}` : null;
  const waMsgLink = (text: string) =>
    waDigits ? `https://wa.me/${waDigits.startsWith("55") ? waDigits : `55${waDigits}`}?text=${encodeURIComponent(text)}` : null;
  const hasReply = outputs.some((o) => o.tipo === "sales_reply");
  const hasStrategy = outputs.some((o) => o.tipo === "deep_strategy");
  const sitePoller = useRef<ReturnType<typeof setInterval> | null>(null);

  // Site completo leva minutos quando o provedor principal falha e o
  // fallback gratuito assume — roda como job no servidor, com polling.
  function pollSiteJob(jobId: string) {
    if (sitePoller.current) clearInterval(sitePoller.current);
    sitePoller.current = setInterval(() => {
      void (async () => {
        const res = await fetch(`/api/ai-jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
        const data = res ? (await res.json().catch(() => null)) as { job?: { status: string; erro?: string | null } } | null : null;
        if (!data?.job) return;
        if (data.job.status === "done") {
          if (sitePoller.current) clearInterval(sitePoller.current);
          sitePoller.current = null;
          setBusyKey("generate_site", false);
          setNotice(t.siteDone);
          router.refresh();
        } else if (data.job.status === "error") {
          if (sitePoller.current) clearInterval(sitePoller.current);
          sitePoller.current = null;
          setBusyKey("generate_site", false);
          setError(data.job.erro ?? t.errNoContent);
        }
      })();
    }, 4000);
  }

  // Ao voltar na página com uma geração em andamento, retoma o polling.
  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/ai-jobs?leadId=${lead.id}`, { cache: "no-store" }).catch(() => null);
      const data = res ? (await res.json().catch(() => null)) as { job?: { id: string; status: string } | null } | null : null;
      if (data?.job?.status === "running") {
        setBusyKey("generate_site", true);
        pollSiteJob(data.job.id);
      }
    })();
    return () => { if (sitePoller.current) clearInterval(sitePoller.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateSite() {
    if (isBusy("generate_site")) return;
    setBusyKey("generate_site", true);
    setError("");
    setNotice("");
    const res = await fetch("/api/ai-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        tipo: "generate_site",
        serviceSlug: lead.service_slug,
        requestRef: crypto.randomUUID(),
        prompt: promptFor("generate_site", lead, serviceName),
        context: {
          nome: lead.nome,
          categoria: lead.categoria,
          endereco: lead.endereco,
          cidade: lead.cidade,
          uf: lead.uf,
          telefone: lead.telefone,
          site: lead.site,
          avaliacao: lead.avaliacao,
          totalAvaliacoes: lead.total_avaliacoes,
          imagem: lead.imagem,
          mapsUrl: lead.maps_url,
        },
      }),
    }).catch(() => null);
    const data = res ? (await res.json().catch(() => null)) as { jobId?: string; error?: string } | null : null;
    if (!res?.ok || !data?.jobId) {
      setBusyKey("generate_site", false);
      setError(data?.error ?? t.errNoContent);
      return;
    }
    setNotice(t.siteRunning);
    pollSiteJob(data.jobId);
  }

  async function generate(tipo: "sales_reply" | "deep_strategy") {
    if (isBusy(tipo)) return;
    setBusyKey(tipo, true);
    setError("");
    setNotice("");
    const res = await callAction<{ conteudo?: string; modelo?: string; creditosCobrados?: number }>(
      "ai-generate",
      {
        action: tipo,
        serviceSlug: lead.service_slug,
        businessRef: lead.id,
        requestRef: crypto.randomUUID(),
        prompt: promptFor(tipo, lead, serviceName),
        context: {
          nome: lead.nome,
          categoria: lead.categoria,
          endereco: lead.endereco,
          cidade: lead.cidade,
          uf: lead.uf,
          telefone: lead.telefone,
          site: lead.site,
          avaliacao: lead.avaliacao,
          totalAvaliacoes: lead.total_avaliacoes,
          imagem: lead.imagem,
          mapsUrl: lead.maps_url,
        },
      },
    );
    if (!res.ok || !res.data.conteudo) {
      setBusyKey(tipo, false);
      setError(res.ok ? t.errNoContent : res.error);
      return;
    }
    const save = await fetch(`/api/leads/${lead.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, conteudo: res.data.conteudo, modelo: res.data.modelo ?? null }),
    });
    const saved = (await save.json().catch(() => null)) as { output?: OutputRow } | null;
    if (saved?.output) {
      setOutputs((list) => [{ ...saved.output!, conteudo: res.data.conteudo! }, ...list]);
      setOpen((o) => ({ ...o, [saved.output!.id]: true }));
    }
    setBusyKey(tipo, false);
    setNotice(`${OUTPUT_LABEL[tipo]} ${t.genDone}`);
  }

  async function generateImage(kind: "generate_image" | "image_prompt" = "generate_image") {
    const prompt = imagePrompt.trim();
    if (isBusy(kind) || !prompt) return;
    setBusyKey(kind, true);
    setError("");
    setNotice("");
    const res = await callAction<{ conteudo?: string; imagens?: string[]; modelo?: string; creditosCobrados?: number }>(
      "ai-generate",
      {
        action: kind,
        serviceSlug: lead.service_slug,
        businessRef: lead.id,
        requestRef: crypto.randomUUID(),
        prompt,
        context: {
          nome: lead.nome,
          categoria: lead.categoria,
          cidade: lead.cidade,
          uf: lead.uf,
        },
      },
    );
    const conteudo = !res.ok ? null : kind === "image_prompt" ? res.data.conteudo : res.data.imagens?.[0];
    if (!res.ok || !conteudo) {
      setBusyKey(kind, false);
      setError(res.ok ? (kind === "generate_image" ? t.errNoImage : t.errNoContent) : res.error);
      return;
    }
    const save = await fetch(`/api/leads/${lead.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: kind, conteudo, modelo: res.data.modelo ?? null }),
    });
    const saved = (await save.json().catch(() => null)) as { output?: OutputRow } | null;
    if (saved?.output) {
      setOutputs((list) => [{ ...saved.output!, conteudo }, ...list]);
      setOpen((o) => ({ ...o, [saved.output!.id]: true }));
    }
    setImagePrompt("");
    setBusyKey(kind, false);
    setNotice(kind === "image_prompt" ? t.promptDone : t.genDone);
  }

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function removeLead() {
    if (isBusy("delete") || !confirm(`${t.confirmDelete} "${lead.nome}" ${t.confirmDeleteSuffix}`)) return;
    setBusyKey("delete", true);
    const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    if (res.ok) router.replace("/app/leads");
    else { setBusyKey("delete", false); setError(t.errDelete); }
  }

  function openSite(html: string) {
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  }

  function downloadSite(html: string) {
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${lead.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setNotice(t.copied);
  }

  return <>
    <header className="lead-head">
      {placeImageSrc(lead.imagem) && <div className="lead-photo" style={{ backgroundImage: `url(${placeImageSrc(lead.imagem)})` }} role="img" aria-label={lead.nome} />}
      <div className="lead-head-main">
        <div className="lead-head-top">
          <h1>{lead.nome}</h1>
          <select
            aria-label="Status do lead"
            value={lead.status}
            className={`lead-status lead-status-${lead.status}`}
            onChange={(e) => { const status = e.target.value as LeadRow["status"]; setLead((l) => ({ ...l, status })); void patch({ status }); }}
          >
            {LEAD_STATUS.map(([v]) => <option key={v} value={v}>{statusLabels[v] ?? v}</option>)}
          </select>
        </div>
        {lead.categoria && <span className="seek-category">{lead.categoria} · {serviceName}</span>}
        {lead.endereco && <p className="seek-line"><MapPin size={12} />{[lead.endereco, lead.cidade, lead.uf].filter(Boolean).join(" · ")}</p>}
        <div className="lead-contacts">
          {lead.telefone && <a className="seek-badge seek-badge-ok" href={waLink ?? "#"} target="_blank" rel="noopener noreferrer"><Phone size={11} />{lead.telefone}</a>}
          {lead.whatsapp === "sim" && <span className="seek-badge seek-badge-ok"><MessageCircle size={11} />{t.labels.waYes}</span>}
          {lead.whatsapp === "nao" && <span className="seek-badge">{t.labels.waNo}</span>}
          {lead.avaliacao !== null && <span className="seek-badge"><Star size={11} />{lead.avaliacao.toFixed(1)}{lead.total_avaliacoes ? ` · ${lead.total_avaliacoes} ${t.labels.rating}` : ""}</span>}
          {lead.site
            ? <a className="seek-badge seek-badge-ok" href={lead.site} target="_blank" rel="noopener noreferrer"><Globe size={11} />{t.labels.siteYes}<ExternalLink size={10} /></a>
            : <span className="seek-badge seek-badge-gap">{t.labels.siteNo}</span>}
          {siteCheckLabel && <span
            className={`seek-badge ${siteCheck!.estado === "bom" ? "seek-badge-ok" : siteCheck!.estado === "ok" ? "" : "seek-badge-gap"}`}
            title={(siteCheck!.sinais ?? []).join(" · ")}>
            {siteCheckLabel}
          </span>}
          {lead.instagram && <a className="seek-badge" href={`https://instagram.com/${lead.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"><Instagram size={11} />{lead.instagram}</a>}
          {lead.maps_url && <a className="seek-badge" href={lead.maps_url} target="_blank" rel="noopener noreferrer"><MapPin size={11} />Maps<ExternalLink size={10} /></a>}
        </div>
      </div>
    </header>

    <section className="lead-actions">
      {!hasReply && <button type="button" className="button button-primary button-small" disabled={isBusy("sales_reply")}
        onClick={() => void generate("sales_reply")}>
        {isBusy("sales_reply") ? <Loader2 size={14} className="spin" /> : <MessageSquareText size={14} />}
        {t.actReply}
      </button>}
      {!hasStrategy && <button type="button" className="button button-glass button-small" disabled={isBusy("deep_strategy")}
        onClick={() => void generate("deep_strategy")}>
        {isBusy("deep_strategy") ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
        {t.actStrategy}
      </button>}
      {canSite && <button type="button" className="button button-glass button-small" disabled={isBusy("generate_site")}
        onClick={() => void generateSite()}>
        {isBusy("generate_site") ? <Loader2 size={14} className="spin" /> : <MonitorSmartphone size={14} />}
        {t.actSite}
      </button>}
      <button type="button" className="button button-glass button-small lead-delete" disabled={isBusy("delete")}
        onClick={() => void removeLead()}>
        <Trash2 size={14} />{t.delete}
      </button>
    </section>

    {error && <p role="alert" className="auth-error">{error}</p>}
    {notice && <p role="status" className="editor-saved"><Sparkles size={14} />{notice}</p>}

    {canImage && <section className="lead-image-gen">
      <h2><ImagePlus size={17} /> {t.imgTitle}</h2>
      <p className="seek-meta">{t.imgHint}</p>
      <div className="lead-image-row">
        <input
          value={imagePrompt}
          maxLength={2000}
          placeholder={t.imgPh}
          onChange={(e) => setImagePrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void generateImage(); } }}
        />
        <button type="button" className="button button-glass button-small" disabled={isBusy("image_prompt") || !imagePrompt.trim()}
          onClick={() => void generateImage("image_prompt")}>
          {isBusy("image_prompt") ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
          {t.imgPrompt}
        </button>
        <button type="button" className="button button-primary button-small" disabled={isBusy("generate_image") || !imagePrompt.trim()}
          onClick={() => void generateImage()}>
          {isBusy("generate_image") ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />}
          {t.imgGen}
        </button>
      </div>
    </section>}

    <section className="lead-outputs">
      <h2>{t.outTitle}</h2>
      {outputs.length === 0 && <p className="seek-empty">{t.outEmpty}</p>}
      {outputs.map((o) => <article key={o.id} className="lead-output">
        <button type="button" className="lead-output-head" onClick={() => setOpen((s) => ({ ...s, [o.id]: !s[o.id] }))}>
          <span>{OUTPUT_LABEL[o.tipo]}</span>
          <small>{new Date(o.created_at).toLocaleString()}{o.modelo ? ` · ${o.modelo}` : ""}</small>
        </button>
        {open[o.id] && <div className="lead-output-body">
          {o.tipo === "generate_site" && <div className="lead-output-actions">
            <button type="button" className="button button-glass button-small" onClick={() => openSite(o.conteudo)}><Eye size={14} />{t.openSite}</button>
            <button type="button" className="button button-glass button-small" onClick={() => downloadSite(o.conteudo)}><Download size={14} />{t.downloadHtml}</button>
          </div>}
          {o.tipo === "generate_image" && <div className="lead-output-image">
            <Image src={o.conteudo} alt={OUTPUT_LABEL.generate_image} width={640} height={640} unoptimized
              style={{ width: "100%", height: "auto", borderRadius: 10 }} />
            <a className="button button-glass button-small" href={o.conteudo} download={`imagem-${o.id.slice(0, 8)}.png`} target="_blank" rel="noopener noreferrer">
              <Download size={14} />{t.downloadImg}
            </a>
          </div>}
          {(o.tipo === "sales_reply" || o.tipo === "deep_strategy" || o.tipo === "image_prompt") && <>
            <pre className="lead-output-text">{o.conteudo}</pre>
            <div className="lead-output-actions">
              <button type="button" className="button button-glass button-small" onClick={() => void copy(o.conteudo)}><Copy size={14} />{t.copy}</button>
              {o.tipo === "sales_reply" && waMsgLink(o.conteudo) && (
                <a className="button button-primary button-small lead-wa-send"
                  href={waMsgLink(o.conteudo)!} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={14} />{t.sendWa}
                </a>
              )}
            </div>
          </>}
        </div>}
      </article>)}
    </section>

    <section className="lead-notes">
      <h2>{t.notes}</h2>
      <textarea
        value={notas}
        maxLength={2000}
        placeholder={t.notesPh}
        onChange={(e) => setNotas(e.target.value)}
      />
      <button type="button" className="button button-glass button-small"
        disabled={notas === (lead.notas ?? "")}
        onClick={() => { void patch({ notas }); setLead((l) => ({ ...l, notas })); setNotice(t.notesSaved); }}>
        {t.notesSave}
      </button>
    </section>

    <LeadAssistant lead={lead} serviceName={serviceName} t={t.copilot} />
  </>;
}
