"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Building2, CheckCircle2, ChevronLeft, ChevronRight,
  Globe, Heart, Image as ImageIcon, Instagram, Loader2, MapPin,
  MessageSquareText, Phone, Sparkles, Star, Target, Users, FileCode2,
} from "lucide-react";
import { callAction, fmtCompact, LEAD_STATUS, placeImageSrc, type LeadRow } from "@/lib/app-client";
import { promptFor } from "@/lib/ai-prompts";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import type { Lang } from "@/lib/i18n/shared";

const PAGE_SIZE = 9;

type ActionKind = "sales_reply" | "deep_strategy" | "generate_site" | "generate_image";

const QUICK: { kind: ActionKind; icon: typeof Sparkles; needsImageAction?: boolean }[] = [
  { kind: "sales_reply", icon: MessageSquareText },
  { kind: "deep_strategy", icon: Target },
  { kind: "generate_site", icon: FileCode2 },
  { kind: "generate_image", icon: ImageIcon, needsImageAction: true },
];

const KIND_LABEL: Record<ActionKind, keyof Messages["leadsPage"]> = {
  sales_reply: "actMessage",
  deep_strategy: "actStrategy",
  generate_site: "actSite",
  generate_image: "actImage",
};

export function LeadsBoard({ initialLeads, serviceNames, serviceActions, costs, doneByLead = {}, lang = "pt", t = getMessages("pt").leadsPage }: {
  initialLeads: LeadRow[];
  serviceNames: Record<string, string>;
  serviceActions: Record<string, string[]>;
  costs: Record<string, number | null>;
  doneByLead?: Record<string, string[]>;
  lang?: Lang;
  t?: Messages["leadsPage"];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [done, setDone] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(Object.entries(doneByLead).map(([k, v]) => [k, new Set(v)])));
  const [filter, setFilter] = useState<string>("todos");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notices, setNotices] = useState<Record<string, string>>({});

  function markDone(leadId: string, kind: string) {
    setDone((d) => ({ ...d, [leadId]: new Set([...(d[leadId] ?? []), kind]) }));
  }

  function suggestion(lead: LeadRow): string {
    if (!lead.site && lead.whatsapp === "sim") return t.sugNoSiteWa;
    if (!lead.site) return t.sugNoSite;
    if (lead.whatsapp !== "sim") return t.sugDefault;
    if ((lead.avaliacao ?? 0) >= 4.5) return t.sugHigh;
    return t.sugDefault;
  }

  const statusLabel = (value: string) => t.status[value] ?? value;

  const visible = useMemo(
    () => (filter === "todos" ? leads : leads.filter((l) => l.status === filter)),
    [leads, filter],
  );
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: leads.length };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  function pick(f: string) { setFilter(f); setPage(0); }

  async function setStatus(id: string, status: LeadRow["status"]) {
    if (busy) return;
    setBusy(id);
    setError("");
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (!res.ok) { setError(t.noneHere); return; }
    setLeads((list) => list.map((l) => l.id === id ? { ...l, status } : l));
  }

  function notice(id: string, msg: string) {
    setNotices((n) => ({ ...n, [id]: msg }));
  }

  // Site roda como job (geração longa) — o resto vai direto na edge.
  async function generateSiteJob(lead: LeadRow, serviceName: string) {
    const res = await fetch("/api/ai-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id, tipo: "generate_site", serviceSlug: lead.service_slug,
        requestRef: crypto.randomUUID(), lang,
        prompt: promptFor("generate_site", lead, serviceName, lang),
        context: {
          nome: lead.nome, categoria: lead.categoria, endereco: lead.endereco,
          cidade: lead.cidade, uf: lead.uf, telefone: lead.telefone, site: lead.site,
          avaliacao: lead.avaliacao, totalAvaliacoes: lead.total_avaliacoes,
          imagem: lead.imagem, mapsUrl: lead.maps_url, instagram: lead.instagram,
        },
      }),
    }).catch(() => null);
    const data = res ? (await res.json().catch(() => null)) as { jobId?: string; error?: string } | null : null;
    if (!res?.ok || !data?.jobId) {
      setBusy(null);
      setError(data?.error ?? t.noneHere);
      return;
    }
    notice(lead.id, `${t.actSite}…`);
    const poller = setInterval(async () => {
      const r = await fetch(`/api/ai-jobs/${data.jobId}`, { cache: "no-store" }).catch(() => null);
      const j = r ? (await r.json().catch(() => null)) as { job?: { status: string; erro?: string | null } } | null : null;
      if (!j?.job) return;
      if (j.job.status === "done") {
        clearInterval(poller);
        setBusy(null);
        markDone(lead.id, "generate_site");
        notice(lead.id, `${t.actSite} — ${t.generated}`);
      } else if (j.job.status === "error") {
        clearInterval(poller);
        setBusy(null);
        setError(j.job.erro ?? "Erro");
      }
    }, 4000);
  }

  async function generate(lead: LeadRow, kind: ActionKind) {
    const key = `${lead.id}:${kind}`;
    if (busy) return;
    setBusy(key);
    setError("");
    notice(lead.id, "");
    const serviceName = serviceNames[lead.service_slug] ?? lead.service_slug;
    if (kind === "generate_site") { await generateSiteJob(lead, serviceName); return; }
    const res = await callAction<{ conteudo?: string; imagens?: string[]; modelo?: string; creditosCobrados?: number }>(
      "ai-generate",
      {
        action: kind,
        serviceSlug: lead.service_slug,
        businessRef: lead.id,
        requestRef: crypto.randomUUID(),
        lang,
        prompt: promptFor(kind, lead, serviceName, lang),
        context: {
          nome: lead.nome, categoria: lead.categoria, endereco: lead.endereco,
          cidade: lead.cidade, uf: lead.uf, telefone: lead.telefone, site: lead.site,
          avaliacao: lead.avaliacao, totalAvaliacoes: lead.total_avaliacoes,
          imagem: lead.imagem, mapsUrl: lead.maps_url, instagram: lead.instagram,
        },
      },
    );
    if (!res.ok) {
      setBusy(null);
      setError(res.error);
      return;
    }
    const conteudo = res.data.conteudo ?? res.data.imagens?.[0] ?? null;
    if (conteudo) {
      await fetch(`/api/leads/${lead.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: kind, conteudo, modelo: res.data.modelo ?? null }),
      }).catch(() => null);
    }
    setBusy(null);
    markDone(lead.id, kind);
    const label = t[KIND_LABEL[kind]] as string;
    notice(lead.id, `${label} — ${t.generated}`);
  }

  return <>
    <div className="lead-filters" role="tablist" aria-label={t.title}>
      <button className={filter === "todos" ? "active" : ""} onClick={() => pick("todos")}>
        {t.filterAll} ({counts.todos ?? 0})</button>
      {LEAD_STATUS.map(([value]) => counts[value] ?
        <button key={value} className={filter === value ? "active" : ""} onClick={() => pick(value)}>
          {statusLabel(value)} ({counts[value]})</button> : null)}
    </div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {visible.length === 0 && <p className="seek-empty">{t.noneHere}</p>}

    <div className="lead-grid">
      {pageItems.map((lead) => {
        const actions = serviceActions[lead.service_slug] ?? [];
        const serviceName = serviceNames[lead.service_slug] ?? lead.service_slug;
        const ig = (lead.dados?.ig ?? null) as
          { seguidores?: number | null; posts?: number | null; curtidas?: number | null; foto?: string | null; bio?: string | null } | null;
        return <article key={lead.id} className="lead-card">
          <div className="lead-card-media">
            {placeImageSrc(lead.imagem)
              // eslint-disable-next-line @next/next/no-img-element -- URL externa do provedor de lugares
              ? <img src={placeImageSrc(lead.imagem)!} alt={`Foto de ${lead.nome}`} loading="lazy" />
              : <span className="lead-card-fallback"><Building2 size={26} />{lead.nome.slice(0, 1)}</span>}
            <select
              aria-label={`${lead.nome}`}
              value={lead.status}
              disabled={busy === lead.id}
              onChange={(e) => void setStatus(lead.id, e.target.value as LeadRow["status"])}
              className={`lead-status lead-status-${lead.status}`}
            >
              {LEAD_STATUS.map(([value]) => <option key={value} value={value}>{statusLabel(value)}</option>)}
            </select>
          </div>

          <div className="lead-card-body">
            <h3><Link href={`/app/leads/${lead.id}`}>{lead.nome}</Link></h3>
            <p className="lead-row-meta">
              {lead.categoria && <span>{lead.categoria}</span>}
              {[lead.cidade, lead.uf].filter(Boolean).length > 0 &&
                <span><MapPin size={11} />{[lead.cidade, lead.uf].filter(Boolean).join("/")}</span>}
              {lead.avaliacao !== null &&
                <span className="seek-score"><Star size={11} />{lead.avaliacao.toFixed(1)}{lead.total_avaliacoes ? ` (${lead.total_avaliacoes})` : ""}</span>}
              {lead.telefone && <span><Phone size={11} />{lead.telefone}</span>}
            </p>
            <p className="lead-row-tags">
              <span className="seek-badge">{serviceName}</span>
              {!lead.site && <span className="seek-badge seek-badge-gap">{t.siteNo}</span>}
              {lead.site && <span className="seek-badge seek-badge-ok"><Globe size={10} />{t.siteYes}</span>}
              {lead.whatsapp === "sim" && <span className="seek-badge seek-badge-ok">WhatsApp</span>}
              {lead.instagram && !ig && <span className="seek-badge">{lead.instagram}</span>}
            </p>
            {ig && <a className="seek-ig" href={`https://instagram.com/${(lead.instagram ?? "").replace(/^@/, "")}`}
              target="_blank" rel="noopener noreferrer" title={ig.bio ?? ""}>
              {ig.foto
                // eslint-disable-next-line @next/next/no-img-element -- CDN do Instagram
                ? <img className="seek-ig-pic" src={ig.foto} alt="" loading="lazy" />
                : <span className="seek-ig-pic seek-ig-pic-empty"><Instagram size={12} /></span>}
              <span className="seek-ig-handle">{lead.instagram}</span>
              {ig.seguidores !== null && ig.seguidores !== undefined &&
                <span className="seek-ig-stat"><Users size={11} />{fmtCompact(ig.seguidores, lang)}</span>}
              {ig.posts !== null && ig.posts !== undefined &&
                <span className="seek-ig-stat">{fmtCompact(ig.posts, lang)} {t.igPosts}</span>}
              {ig.curtidas !== null && ig.curtidas !== undefined &&
                <span className="seek-ig-stat"><Heart size={11} />{fmtCompact(ig.curtidas, lang)} {t.igLikes}</span>}
            </a>}
            {ig?.bio && <p className="lead-ig-bio">{ig.bio}</p>}
            <p className="lead-tip"><Sparkles size={12} />{suggestion(lead)}</p>

            <div className="lead-actions">
              {QUICK.filter((q) => actions.includes(q.kind)).map(({ kind, icon: Icon }) => {
                const key = `${lead.id}:${kind}`;
                const label = t[KIND_LABEL[kind]] as string;
                if (done[lead.id]?.has(kind)) {
                  return <Link key={kind} className="lead-action lead-action-done"
                    href={`/app/leads/${lead.id}`} title={`${label} — ${t.generated}`}>
                    <CheckCircle2 size={13} />{label}
                  </Link>;
                }
                return <button key={kind} type="button" className="lead-action"
                  disabled={busy !== null || costs[kind] === null}
                  title={label}
                  onClick={() => void generate(lead, kind)}>
                  {busy === key ? <Loader2 size={13} className="spin" /> : <Icon size={13} />}
                  {label}
                </button>;
              })}
              <Link className="lead-open" href={`/app/leads/${lead.id}`}>{t.open} <ArrowUpRight size={13} /></Link>
            </div>
            {notices[lead.id] && <p className="lead-notice"><CheckCircle2 size={12} />{notices[lead.id]}</p>}
          </div>
        </article>;
      })}
    </div>

    {pages > 1 && (
      <nav className="lead-pager" aria-label={t.title}>
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> {t.prev}</button>
        <span>{page + 1} / {pages}</span>
        <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>{t.next} <ChevronRight size={14} /></button>
      </nav>
    )}
  </>;
}
