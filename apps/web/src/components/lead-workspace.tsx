"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Check, Copy, Download, ExternalLink, Eye, Heart, ImagePlus, Instagram, Loader2,
  Lock, MapPin, MessageSquareText, Phone, Sparkles, Star, Trash2, Globe, Users,
  MessageCircle, FileText, MonitorSmartphone, Power,
} from "lucide-react";
import { callAction, fmtCompact, LEAD_STATUS, placeImageSrc, type LeadRow } from "@/lib/app-client";
import { promptFor } from "@/lib/ai-prompts";
import { formatMoney, type Currency, type Lang } from "@/lib/i18n/shared";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { callingCodeFor, toE164 } from "@/lib/phone";
import { LeadAssistant } from "./lead-assistant";
import { isCreditsError, OutOfCredits } from "./out-of-credits";

interface OutputRow {
  id: string;
  tipo: "sales_reply" | "deep_strategy" | "generate_site" | "generate_image" | "image_prompt";
  conteudo: string;
  modelo: string | null;
  created_at: string;
}

const NEXT_STAGE: Record<string, LeadRow["status"] | undefined> = {
  novo: "contatado", contatado: "respondeu", respondeu: "proposta", proposta: "ganho",
};

export function LeadWorkspace({ lead: initialLead, outputs: initialOutputs, serviceName, enabledActions, siteSlug, siteActive = null, siteOffMotivo = null, senderName = null, currency = "brl", lang = "pt", t = getMessages("pt").lead, statusLabels = getMessages("pt").leadsPage.status }: {
  lead: LeadRow;
  outputs: OutputRow[];
  serviceName: string;
  enabledActions: string[];
  siteSlug?: string | null;
  siteActive?: boolean | null;
  siteOffMotivo?: string | null;
  senderName?: string | null;
  currency?: Currency;
  lang?: Lang;
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
  const [siteOn, setSiteOn] = useState(siteActive !== false);
  const [offMotivo, setOffMotivo] = useState(siteOffMotivo);
  const [siteToggleBusy, setSiteToggleBusy] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [wonValue, setWonValue] = useState("");
  const wonPending = useRef<LeadRow["status"] | null>(null);

  const canSite = enabledActions.includes("generate_site");
  const siteCheck = (lead as LeadRow & {
    dados?: { siteCheck?: { estado?: string; sinais?: string[] } | null } | null;
  }).dados?.siteCheck ?? null;
  const ig = (lead as LeadRow & {
    dados?: { ig?: { seguidores?: number | null; posts?: number | null; curtidas?: number | null; foto?: string | null; bio?: string | null } | null } | null;
  }).dados?.ig ?? null;
  const siteCheckLabel = siteCheck?.estado === "desatualizado" ? t.labels.siteOld
    : siteCheck?.estado === "fora" ? t.labels.siteOut
    : siteCheck?.estado === "bom" ? t.labels.siteBom
    : siteCheck?.estado === "ok" ? t.labels.siteComum : null;
  const canImage = enabledActions.includes("generate_image");
  // wa.me precisa do DDI do país do lead — "+55" cego quebra número gringo.
  const leadPais = lead.pais
    ?? (typeof (lead.dados as Record<string, unknown> | null | undefined)?.pais === "string"
      ? (lead.dados as Record<string, unknown>).pais as string : null);
  const waDigits = toE164(lead.telefone, callingCodeFor(leadPais));
  const waLink = waDigits ? `https://wa.me/${waDigits}` : null;
  const waMsgLink = (text: string) =>
    waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}` : null;
  const hasStrategy = outputs.some((o) => o.tipo === "deep_strategy");
  const latestReply = outputs.find((o) => o.tipo === "sales_reply");
  const latestImage = outputs.find((o) => o.tipo === "generate_image");
  const hasSite = Boolean(siteSlug);
  const siteHref = siteSlug ? `/site/${siteSlug}` : null;
  const siteAbsoluteUrl = () =>
    siteSlug ? `${window.location.origin}/site/${siteSlug}` : "";
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
        lang,
        prompt: promptFor("generate_site", lead, serviceName, lang),
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
    pollSiteJob(data.jobId);
  }

  async function generate(tipo: "sales_reply" | "deep_strategy", extra?: { prompt?: string; context?: Record<string, unknown> }) {
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
        lang,
        prompt: promptFor(tipo, lead, serviceName, lang) + (extra?.prompt ?? ""),
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
          ...extra?.context,
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

  // Etapa 2 da jornada — a mensagem sai com o link do site e assinada
  // com o nome de quem está vendendo (perfil da conta).
  function generateOutreach() {
    const site = siteAbsoluteUrl();
    void generate("sales_reply", {
      prompt: (site ? `\n\nO site de demonstração já está pronto: ${site} — inclua o link completo na mensagem de forma natural (ex.: "montei uma prévia do site pra você ver").` : "")
        + (senderName ? `\nAssine a mensagem como "${senderName}".` : ""),
      context: { remetente: senderName ?? undefined, siteUrl: site || undefined },
    });
  }

  async function generateImage(kind: "generate_image" | "image_prompt" = "generate_image", preset?: string) {
    const prompt = (preset ?? imagePrompt).trim();
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
        lang,
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

  function changeStatus(next: LeadRow["status"]) {
    if (next === "ganho" && lead.status !== "ganho") {
      wonPending.current = next;
      setWonValue(lead.valor_fechado ? String(lead.valor_fechado) : "");
      setWonOpen(true);
      return;
    }
    setLead((l) => ({ ...l, status: next }));
    void patch({ status: next });
  }

  function advanceStage() {
    const next = NEXT_STAGE[lead.status];
    if (!next || isBusy("stage")) return;
    changeStatus(next);
  }

  async function confirmWon(withValue: boolean) {
    const value = withValue ? Number(wonValue.replace(/\./g, "").replace(",", ".")) : null;
    const status = wonPending.current ?? "ganho";
    wonPending.current = null;
    setWonOpen(false);
    const patchBody: Record<string, unknown> = { status };
    if (withValue && Number.isFinite(value) && value! >= 0) patchBody.valor_fechado = value;
    setLead((l) => ({ ...l, status, valor_fechado: (patchBody.valor_fechado as number | undefined) ?? l.valor_fechado }));
    setBusyKey("stage", true);
    await patch(patchBody);
    setBusyKey("stage", false);
    router.refresh();
  }

  async function removeLead() {
    if (isBusy("delete") || !confirm(`${t.confirmDelete} "${lead.nome}" ${t.confirmDeleteSuffix}`)) return;
    setBusyKey("delete", true);
    const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    if (res.ok) router.replace("/app/leads");
    else { setBusyKey("delete", false); setError(t.errDelete); }
  }

  function openSite(html: string) {
    if (siteSlug) { window.open(`/site/${siteSlug}`, "_blank", "noopener"); return; }
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setNotice(t.copied);
  }

  async function toggleSite() {
    if (!siteSlug || siteToggleBusy) return;
    setSiteToggleBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sites/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: siteSlug, active: !siteOn }),
      });
      if (!res.ok) throw new Error();
      const next = !siteOn;
      setSiteOn(next);
      setOffMotivo(next ? null : "manual");
    } catch {
      setError(t.siteToggleErr);
    } finally {
      setSiteToggleBusy(false);
    }
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
            onChange={(e) => changeStatus(e.target.value as LeadRow["status"])}
          >
            {LEAD_STATUS.map(([v]) => <option key={v} value={v}>{statusLabels[v] ?? v}</option>)}
          </select>
          {NEXT_STAGE[lead.status] && (
            <button type="button" className="lead-next-stage" disabled={isBusy("stage")}
              onClick={advanceStage} title={statusLabels[NEXT_STAGE[lead.status]!]}>
              {t.nextStage} → {statusLabels[NEXT_STAGE[lead.status]!] ?? NEXT_STAGE[lead.status]}
            </button>
          )}
          {lead.status === "ganho" && lead.valor_fechado != null && (
            <button type="button" className="lead-won-value" onClick={() => { wonPending.current = "ganho"; setWonValue(String(lead.valor_fechado)); setWonOpen(true); }}>
              {t.wonBadge} {formatMoney(Math.round(lead.valor_fechado * 100), currency)}
            </button>
          )}
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
          {lead.instagram && !ig && <a className="seek-badge" href={`https://instagram.com/${lead.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"><Instagram size={11} />{lead.instagram}</a>}
          {lead.maps_url && <a className="seek-badge" href={lead.maps_url} target="_blank" rel="noopener noreferrer"><MapPin size={11} />Maps<ExternalLink size={10} /></a>}
        </div>
        {ig && lead.instagram && <a className="seek-ig" href={`https://instagram.com/${lead.instagram.replace(/^@/, "")}`}
          target="_blank" rel="noopener noreferrer" title={ig.bio ?? ""}>
          {ig.foto
            // eslint-disable-next-line @next/next/no-img-element -- CDN do Instagram
            ? <img className="seek-ig-pic" src={ig.foto} alt="" loading="lazy" />
            : <span className="seek-ig-pic seek-ig-pic-empty"><Instagram size={12} /></span>}
          <span className="seek-ig-handle">{lead.instagram}</span>
          {ig.seguidores != null && <span className="seek-ig-stat"><Users size={11} />{fmtCompact(ig.seguidores, lang)}</span>}
          {ig.posts != null && <span className="seek-ig-stat">{fmtCompact(ig.posts, lang)} posts</span>}
          {ig.curtidas != null && <span className="seek-ig-stat"><Heart size={11} />{fmtCompact(ig.curtidas, lang)}/post</span>}
          {ig.bio && <span className="lead-ig-bio">{ig.bio}</span>}
        </a>}
      </div>
    </header>

    <section className="lead-actions">
      {!hasStrategy && <button type="button" className="button button-glass button-small" disabled={isBusy("deep_strategy")}
        onClick={() => void generate("deep_strategy")}>
        {isBusy("deep_strategy") ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
        {isBusy("deep_strategy") ? t.actStrategyBusy : t.actStrategy}
      </button>}
      <button type="button" className="button button-glass button-small lead-delete" disabled={isBusy("delete")}
        onClick={() => void removeLead()}>
        <Trash2 size={14} />{t.delete}
      </button>
    </section>

    {error && (isCreditsError(error)
      ? <OutOfCredits lang={lang} />
      : <p role="alert" className="auth-error">{error}</p>)}
    {notice && <p role="status" className="editor-saved"><Sparkles size={14} />{notice}</p>}

    <section className="lead-journey">
      <h2><Sparkles size={17} /> {t.journey}</h2>
      <ol className="lead-steps">
        {canSite && <li className={`lead-step ${hasSite ? "is-done" : "is-active"}`}>
          <div className="lead-step-head">
            <span className="lead-step-num">{hasSite ? <Check size={13} /> : 1}</span>
            <div><strong>{t.step1}</strong><small>{t.step1Hint}</small></div>
          </div>
          {hasSite && siteHref ? <div className="lead-site-done">
            {siteOn ? <>
              <a className="lead-site-frame" href={siteHref} target="_blank" rel="noopener noreferrer">
                <iframe src={siteHref} title={`${t.openSite} — ${lead.nome}`} loading="lazy" tabIndex={-1} />
                <span className="lead-site-open"><ExternalLink size={15} />{t.openSite}</span>
              </a>
              <div className="lead-output-actions">
                <button type="button" className="button button-glass button-small"
                  onClick={() => void copy(siteAbsoluteUrl())}>
                  <Copy size={14} />{t.copyLink}
                </button>
                <a className="button button-glass button-small" href={siteHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />{`/site/${siteSlug}`}
                </a>
                <button type="button" className="button button-glass button-small lead-site-power"
                  disabled={siteToggleBusy} onClick={() => void toggleSite()}>
                  {siteToggleBusy ? <Loader2 size={14} className="spin" /> : <Power size={14} />}
                  {t.deactivateSite}
                </button>
              </div>
              <div className="lead-domain-cta">
                <div className="lead-domain-cta-copy">
                  <strong><Globe size={13} />{t.domTitle}</strong>
                  <span>{t.domPitch}</span>
                </div>
                <a className="button button-primary button-small" href={`/app/dominios?site=${siteSlug}`}>
                  {t.domBtn}
                </a>
              </div>
              <small className="lead-site-trial">{t.siteTrial}</small>
            </> : <div className="lead-site-off" role="status">
              <Power size={16} />
              <div className="lead-site-off-text">
                <strong>{t.siteOff}</strong>
                <small>{offMotivo === "expired" ? t.siteOffExpired : t.siteOffManual}</small>
              </div>
              <button type="button" className="button button-glass button-small"
                disabled={siteToggleBusy} onClick={() => void toggleSite()}>
                {siteToggleBusy ? <Loader2 size={14} className="spin" /> : <Power size={14} />}
                {t.reactivateSite}
              </button>
            </div>}
          </div> : <div className="lead-step-body">
            <button type="button" className="button button-primary button-small" disabled={isBusy("generate_site")}
              onClick={() => void generateSite()}>
              {isBusy("generate_site") ? <Loader2 size={14} className="spin" /> : <MonitorSmartphone size={14} />}
              {isBusy("generate_site") ? t.actSiteBusy : t.actSite}
            </button>
            {isBusy("generate_site") && <small className="lead-step-wait">{t.siteRunning}</small>}
          </div>}
        </li>}

        <li className={`lead-step ${!hasSite && canSite ? "is-locked" : latestReply ? "is-done" : "is-active"}`}>
          <div className="lead-step-head">
            <span className="lead-step-num">
              {!hasSite && canSite ? <Lock size={12} /> : latestReply ? <Check size={13} /> : canSite ? 2 : 1}
            </span>
            <div><strong>{t.step2}</strong><small>{t.step2Hint}</small></div>
          </div>
          {!hasSite && canSite ? <small className="lead-step-locked">{t.stepLocked}</small>
            : latestReply ? <>
              <pre className="lead-output-text lead-step-text">{latestReply.conteudo}</pre>
              <div className="lead-output-actions">
                <button type="button" className="button button-glass button-small" onClick={() => void copy(latestReply.conteudo)}>
                  <Copy size={14} />{t.copy}
                </button>
                {waMsgLink(latestReply.conteudo) && (
                  <a className="button button-primary button-small lead-wa-send"
                    href={waMsgLink(latestReply.conteudo)!} target="_blank" rel="noopener noreferrer">
                    <MessageCircle size={14} />{t.sendWa}
                  </a>
                )}
              </div>
            </> : <div className="lead-step-body">
              <button type="button" className="button button-primary button-small" disabled={isBusy("sales_reply")}
                onClick={() => generateOutreach()}>
                {isBusy("sales_reply") ? <Loader2 size={14} className="spin" /> : <MessageSquareText size={14} />}
                {isBusy("sales_reply") ? t.msgGenBusy : t.msgGen}
              </button>
            </div>}
        </li>

        {canImage && <li className={`lead-step ${!latestReply ? "is-locked" : latestImage ? "is-done" : "is-active"}`}>
          <div className="lead-step-head">
            <span className="lead-step-num">
              {!latestReply ? <Lock size={12} /> : latestImage ? <Check size={13} /> : canSite ? 3 : 2}
            </span>
            <div><strong>{t.step3}</strong><small>{t.step3Hint}</small></div>
          </div>
          {!latestReply ? <small className="lead-step-locked">{t.stepLocked}</small> : <div className="lead-step-body">
            <button type="button" className="button button-primary button-small"
              disabled={isBusy("generate_image")}
              onClick={() => void generateImage("generate_image", `post de WhatsApp divulgando o novo site de ${lead.nome}`)}>
              {isBusy("generate_image") ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
              {isBusy("generate_image") ? t.imgGenBusy : t.imgSupport}
            </button>
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
                {isBusy("image_prompt") ? t.imgPromptBusy : t.imgPrompt}
              </button>
              <button type="button" className="button button-glass button-small" disabled={isBusy("generate_image") || !imagePrompt.trim()}
                onClick={() => void generateImage()}>
                {isBusy("generate_image") ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />}
                {isBusy("generate_image") ? t.imgGenBusy : t.imgGen}
              </button>
            </div>
            {latestImage && <div className="lead-output-image lead-step-image">
              <Image src={latestImage.conteudo} alt={t.step3} width={640} height={640} unoptimized
                style={{ width: "100%", height: "auto", borderRadius: 10 }} />
              <a className="button button-glass button-small" href={latestImage.conteudo}
                download={`imagem-${latestImage.id.slice(0, 8)}.png`} target="_blank" rel="noopener noreferrer">
                <Download size={14} />{t.downloadImg}
              </a>
            </div>}
          </div>}
        </li>}
      </ol>
    </section>

    <section className="lead-outputs">
      <h2>{t.outTitle}</h2>
      {outputs.length === 0 && <p className="seek-empty">{t.outEmpty}</p>}
      {outputs.map((o) => <article key={o.id} className="lead-output">
        <button type="button" className="lead-output-head" onClick={() => setOpen((s) => ({ ...s, [o.id]: !s[o.id] }))}>
          <span>{OUTPUT_LABEL[o.tipo]}</span>
          <small>{new Date(o.created_at).toLocaleString()}{o.modelo ? ` · ${o.modelo}` : ""}</small>
        </button>
        {open[o.id] && <div className="lead-output-body">
          {o.tipo === "generate_site" && <>
            <iframe className="lead-site-preview" srcDoc={o.conteudo} sandbox="allow-scripts"
              title={`${OUTPUT_LABEL.generate_site} — ${lead.nome}`} loading="lazy" />
            <div className="lead-output-actions">
              {siteSlug
                ? <>
                  <a className="button button-glass button-small" href={`/site/${siteSlug}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />{`/site/${siteSlug}`}</a>
                  <a className="button button-glass button-small" href={`/app/dominios?site=${siteSlug}`}><Globe size={14} />{t.domBtn}</a>
                </>
                : null}
              <button type="button" className="button button-glass button-small" onClick={() => openSite(o.conteudo)}><Eye size={14} />{t.openSite}</button>
            </div>
          </>}
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

    <LeadAssistant lead={lead} serviceName={serviceName} lang={lang} statusLabel={statusLabels[lead.status] ?? lead.status} t={t.copilot} />

    {wonOpen && <div className="pix-overlay" role="dialog" aria-modal="true" aria-label={t.wonTitle}
      onClick={() => { setWonOpen(false); wonPending.current = null; }}>
      <section className="pix-panel pix-modal lead-won-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t.wonTitle}</h3>
        <p className="seek-meta">{t.wonHint}</p>
        <div className="lead-won-input">
          <span>{currency.toUpperCase()}</span>
          <input
            inputMode="decimal"
            autoFocus
            value={wonValue}
            placeholder={t.wonPh}
            onChange={(e) => setWonValue(e.target.value.replace(/[^\d.,]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void confirmWon(true); } }}
          />
        </div>
        <div className="seek-confirm-actions">
          <button type="button" className="button button-primary button-small"
            disabled={!wonValue.trim() || isBusy("stage")} onClick={() => void confirmWon(true)}>
            {isBusy("stage") ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {t.wonSave}
          </button>
          <button type="button" className="button button-glass button-small" onClick={() => void confirmWon(false)}>
            {t.wonSkip}
          </button>
        </div>
      </section>
    </div>}
  </>;
}
