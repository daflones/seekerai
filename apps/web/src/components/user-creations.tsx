"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink,
  Globe, Image as ImageIcon, Loader2, MessageSquareText, Monitor,
  Smartphone, Sparkles, FileText, Brain, Eye,
} from "lucide-react";
import type { Messages } from "@/lib/i18n/messages";
import type { CreationItem } from "@/app/api/criacoes/route";

type T = Messages["creationsPage"];
type Kind = "all" | "site" | "app" | "image" | "text";

interface ListResponse {
  items: CreationItem[]; total: number; page: number; pages: number;
  leads: { id: string; nome: string }[];
}

const TEXT_ICONS: Record<string, typeof MessageSquareText> = {
  sales_reply: MessageSquareText,
  deep_strategy: Brain,
  image_prompt: FileText,
};

const TEXT_LABELS: Record<string, { pt: string; en: string; es: string; fr: string; de: string; it: string }> = {
  sales_reply: { pt: "Mensagem de abordagem", en: "Outreach message", es: "Mensaje de contacto", fr: "Message d'approche", de: "Anschreiben", it: "Messaggio di contatto" },
  deep_strategy: { pt: "Estratégia", en: "Strategy", es: "Estrategia", fr: "Stratégie", de: "Strategie", it: "Strategia" },
  image_prompt: { pt: "Prompt de imagem", en: "Image prompt", es: "Prompt de imagen", fr: "Prompt d'image", de: "Bild-Prompt", it: "Prompt immagine" },
};

export function UserCreations({ t, lang }: { t: T; lang: string }) {
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");
  const [leadId, setLeadId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ type: kind, page: String(page), size: "12" });
      if (q.trim()) params.set("q", q.trim());
      if (leadId) params.set("lead", leadId);
      const res = await fetch(`/api/criacoes?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `Erro ${res.status}`);
      setData(json as ListResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setLoading(false);
    }
  }, [kind, q, leadId, page, t.failed]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  function onSearch(value: string) {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setPage(1); setQ(value); }, 350);
  }

  async function fetchContent(id: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/criacoes/output?id=${id}`);
      const json = await res.json().catch(() => ({}));
      return res.ok ? (json.output?.conteudo ?? null) : null;
    } catch { return null; }
  }

  async function toggleExpand(item: CreationItem) {
    if (expanded[item.id]) {
      setExpanded((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
      return;
    }
    const full = await fetchContent(item.id);
    if (full) setExpanded((prev) => ({ ...prev, [item.id]: full }));
  }

  async function copy(item: CreationItem) {
    const text = expanded[item.id] ?? item.excerpt ?? await fetchContent(item.id);
    if (!text) return;
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(""), 1600);
  }

  async function downloadImage(item: CreationItem) {
    const content = await fetchContent(item.id);
    if (!content) return;
    const name = `${(item.leadName || "imagem").slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    if (content.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = content; a.download = name; a.click();
    } else {
      window.open(content, "_blank", "noopener,noreferrer");
    }
  }

  const filters: { id: Kind; label: string; icon: typeof Globe }[] = [
    { id: "all", label: t.fAll, icon: Sparkles },
    { id: "site", label: t.fSites, icon: Globe },
    { id: "app", label: t.fApps, icon: Monitor },
    { id: "image", label: t.fImages, icon: ImageIcon },
    { id: "text", label: t.fTexts, icon: MessageSquareText },
  ];

  function textLabel(sub: string): string {
    const entry = TEXT_LABELS[sub];
    return entry?.[lang as keyof typeof entry] ?? entry?.pt ?? sub;
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang, { day: "2-digit", month: "short", year: "numeric" });

  return <>
    <div className="cre-toolbar">
      <div className="cre-filters" role="tablist">
        {filters.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={kind === id}
            className={`cre-chip${kind === id ? " on" : ""}`}
            onClick={() => { setKind(id); setPage(1); }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>
      <div className="cre-tools">
        <input type="search" className="cre-search" placeholder={t.searchPh}
          aria-label={t.searchPh} onChange={(e) => onSearch(e.target.value)} />
        {(data?.leads?.length ?? 0) > 0 && (
          <select className="cre-leads" value={leadId} aria-label={t.allLeads}
            onChange={(e) => { setLeadId(e.target.value); setPage(1); }}>
            <option value="">{t.allLeads}</option>
            {data!.leads.map((l) => <option key={l.id} value={l.id}>{l.nome || l.id.slice(0, 8)}</option>)}
          </select>
        )}
      </div>
    </div>

    {error && <p className="private-intro">{error}</p>}
    {loading && <p className="private-intro"><Loader2 size={16} className="spin" /></p>}

    {!loading && !error && data && data.items.length === 0 && (
      <p className="private-intro">{data.total === 0 && kind === "all" && !q && !leadId ? t.empty : t.emptyFilter}</p>
    )}

    {!loading && data && data.items.length > 0 && <>
      <div className="cre-grid">
        {data.items.map((item) => <article key={`${item.kind}-${item.id}`} className="cre-card">
          {item.kind === "image" && (
            <a className="cre-thumb" href={`/api/criacoes/thumb?id=${item.id}`}
              target="_blank" rel="noopener noreferrer" aria-label={t.download}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/criacoes/thumb?id=${item.id}`} alt={item.title} loading="lazy" />
            </a>
          )}
          <div className="cre-head">
            <span className={`cre-badge cre-b-${item.kind}`}>
              {item.kind === "site" && <><Globe size={12} />{t.fSites}</>}
              {item.kind === "app" && <>{item.sub === "app_mobile" ? <Smartphone size={12} /> : <Monitor size={12} />}
                {item.sub === "app_mobile" ? t.appMobile : t.appWeb}</>}
              {item.kind === "image" && <><ImageIcon size={12} />{t.fImages}</>}
              {item.kind === "text" && (() => {
                const Icon = TEXT_ICONS[item.sub] ?? FileText;
                return <><Icon size={12} />{textLabel(item.sub)}</>;
              })()}
            </span>
            <time className="cre-date" dateTime={item.createdAt}>{fmtDate(item.createdAt)}</time>
          </div>

          <h3 className="cre-title">{item.title || "—"}</h3>
          <div className="cre-meta">
            {item.leadName
              ? <a className="cre-lead" href={`/app/leads/${item.leadId}`}>{t.leadTag}: {item.leadName}</a>
              : <span className="cre-lead">{t.studioTag}</span>}
            {item.status === "running" && <span className="cre-status cre-s-run"><Loader2 size={11} className="spin" />{t.running}</span>}
            {item.status === "error" && <span className="cre-status cre-s-err" title={item.erro ?? ""}>{t.failed}</span>}
          </div>

          {item.kind === "text" && (
            <pre className="cre-text">{expanded[item.id] ?? item.excerpt ?? ""}</pre>
          )}

          <div className="cre-actions">
            {item.kind === "site" && (item.siteSlug
              ? <a className="cre-btn" href={`/site/${item.siteSlug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} />{t.openSite}</a>
              : <a className="cre-btn" href={`/app/leads/${item.leadId}`}><Eye size={13} />{t.viewText}</a>)}
            {item.kind === "app" && <>
              {item.siteSlug && <a className="cre-btn" href={`/site/${item.siteSlug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} />{t.openSite}</a>}
              {item.status === "done" && <a className="cre-btn" href={`/app/criar?p=${item.id}`}>
                <Monitor size={13} />{t.openApp}</a>}
              {item.status === "error" && <a className="cre-btn" href={`/app/criar`}>
                <Monitor size={13} />{t.openApp}</a>}
            </>}
            {item.kind === "image" && <>
              <button type="button" className="cre-btn" onClick={() => void downloadImage(item)}>
                <Download size={13} />{t.download}</button>
            </>}
            {item.kind === "text" && <>
              <button type="button" className="cre-btn" onClick={() => void toggleExpand(item)}>
                <Eye size={13} />{t.viewText}</button>
              <button type="button" className="cre-btn" onClick={() => void copy(item)}>
                {copiedId === item.id ? <><Check size={13} />{t.copied}</> : <><Copy size={13} />{t.copy}</>}
              </button>
            </>}
          </div>
        </article>)}
      </div>

      {data.pages > 1 && (
        <nav className="cre-pager" aria-label={t.page}>
          <button type="button" className="cre-btn" disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft size={14} />{t.prev}</button>
          <span className="cre-page-info">{t.page} {data.page} / {data.pages}</span>
          <button type="button" className="cre-btn" disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}>
            {t.next}<ChevronRight size={14} /></button>
        </nav>
      )}
    </>}
  </>;
}
