"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowRight, ArrowUpRight, Bookmark, Check, Copy, Globe, Instagram, LayoutGrid, ListFilter, Loader2, Lock, MapPin, MessageCircle, Radar, Search, Sparkles, Star, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { services } from "@/lib/service-catalog";
import { cityGroupsFor, nicheGroupsFor, serviceCategory, serviceName } from "@/lib/catalog-i18n";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/shared";
import { BusinessToolsPreview } from "./business-tools-preview";
import { FancySelect } from "./fancy-select";

// Shape sanitizado que a rota /api/demo/search devolve — contatos
// sempre mascarados, sem URLs de site/maps.
interface DemoResult {
  nome: string | null; cidade: string | null; bairro: string | null; uf: string | null;
  categoria: string | null; avaliacao: number | null; totalAvaliacoes: number | null;
  semSite: boolean; siteEstado: string | null;
  whatsapp: string | null; instagram: string | null; score: number;
}
interface DemoSite { slug: string; nome: string }

const COLORS = ["violet", "cyan", "amber"] as const;
const initials = (nome: string | null) =>
  (nome ?? "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Prévia do domínio que o usuário pode criar pro negócio na conta.
const domainPreview = (nome: string | null) => {
  const slug = (nome ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 30).replace(/-+$/g, "");
  return `${slug || "seu-negocio"}.com.br`;
};

export function ProductDemo({ full = false, loc, t }: {
  full?: boolean;
  loc?: Locale;
  t?: Messages["demo"];
}) {
  const locale: Locale = useMemo(
    () => loc ?? { lang: "pt", region: "BR", currency: "brl", isBrazil: true },
    [loc],
  );
  const tt = t ?? getMessages(locale.lang).demo;
  const lang = locale.lang;
  const nGroups = useMemo(() => nicheGroupsFor(lang), [lang]);
  const cGroups = useMemo(() => cityGroupsFor(locale), [locale]);
  const firstNiche = nGroups[0].options[0].label;
  const firstCity = cGroups[0].cities[0].label;

  const [service, setService] = useState("sites");
  const [niche, setNiche] = useState<string>(firstNiche);
  const [city, setCity] = useState<string>(firstCity);
  const [query, setQuery] = useState({ service: "sites", niche: firstNiche, city: firstCity });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState<DemoResult[] | null>(null);
  const [site, setSite] = useState<DemoSite | null>(null);
  const [restante, setRestante] = useState(3);
  const [upsell, setUpsell] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState(false);
  const [active, setActive] = useState<DemoResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const canonicalNiche = (label: string) =>
    nGroups.flatMap((g) => g.options).find((o) => o.label === label)?.canonical ?? label;
  const leadKey = (l: DemoResult, i: number) => `${l.nome ?? i}-${l.bairro ?? ""}-${i}`;
  const serviceLabel = (id: string) => {
    const s = services.find((item) => item.id === id);
    return s ? serviceName(s.id, s.label, lang) : id;
  };

  // Amostra grátis na montagem — a demo já abre com resultados reais.
  useEffect(() => {
    let dead = false;
    fetch("/api/demo/search")
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (dead || !d) return;
        if (Array.isArray(d.leads) && d.leads.length) setLeads(d.leads);
        if (d.site?.slug) setSite(d.site);
        if (typeof d.restante === "number") setRestante(d.restante);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  const filtered = (leads ?? []).filter((l, i) => !savedOnly || saved.includes(leadKey(l, i)));
  if (sort) [...filtered].reverse();
  const message = active
    ? tt.msg.replace("{name}", active.nome ?? "").replace("{service}", serviceLabel(query.service).toLowerCase())
    : "";

  const siteLabel = (l: DemoResult) =>
    l.semSite ? tt.sigNoSite
    : l.siteEstado === "fora" ? tt.sigOut
    : l.siteEstado === "desatualizado" ? tt.sigOld
    : l.siteEstado === "ok" ? tt.sigOk : tt.sigBom;

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError("");
    const q = `${canonicalNiche(niche)} em ${city}`;
    const res = await fetch("/api/demo/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, regionCode: locale.region }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setLoading(false);
    if (res?.status === 403 || data?.limit) { setUpsell(true); return; }
    if (!res?.ok || !data) { setError(tt.searchErr); return; }
    setQuery({ service, niche, city });
    setLeads(Array.isArray(data.leads) ? data.leads : []);
    if (data.site?.slug) setSite(data.site);
    setSearched(true); setSaved([]); setSavedOnly(false);
    if (typeof data.restante === "number") {
      setRestante(data.restante);
      if (data.restante === 0) setTimeout(() => setUpsell(true), 1800);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true); setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  const rating = (l: DemoResult) =>
    l.avaliacao != null
      ? `${String(l.avaliacao).replace(".", ",")}${l.totalAvaliacoes ? ` (${l.totalAvaliacoes})` : ""}`
      : "—";

  return (
    <div className={`product-window${full ? " product-full" : ""}`}>
      <div className="window-chrome">
        <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
        <span><span className="chrome-lock">◇</span> {tt.chrome}</span>
        <span className="demo-pill"><span /> {tt.pill}</span>
      </div>
      <div className="product-layout">
        <aside className="product-sidebar" aria-label={tt.pill}>
          <div className="sidebar-symbol"><Radar size={22} /></div>
          <button className={!savedOnly ? "selected" : ""} aria-label={tt.allAria} onClick={() => setSavedOnly(false)}><Search size={19} /></button>
          <button className={savedOnly ? "selected" : ""} aria-label={tt.savedAria} onClick={() => setSavedOnly(true)}><Bookmark size={19} /></button>
          <div className="sidebar-bottom">S</div>
        </aside>
        <div className="product-content">
          <div className="product-heading">
            <div><span className="tiny-label">{tt.radar}</span><h3>{tt.heading}<span>.</span></h3></div>
            <span className="example-tag"><Sparkles size={12} /> {tt.illus}</span>
          </div>
          <form className="search-form" onSubmit={search}>
            <label>{tt.offer}<FancySelect ariaLabel={tt.serviceAria} value={service} onChange={setService}
              groups={[...new Set(services.map((s) => s.category))].map((category) => ({
                label: serviceCategory(category, lang),
                options: services.filter((item) => item.category === category)
                  .map((item) => ({ value: item.id, label: serviceName(item.id, item.label, lang) })),
              }))} /></label>
            <label>{tt.want}<FancySelect ariaLabel={tt.nicheAria} value={niche} onChange={setNiche}
              groups={nGroups.map((group) => ({
                label: group.label,
                options: group.options.map((o) => ({ value: o.label, label: o.label })),
              }))} /></label>
            <label>{tt.where}<div className="select-wrap"><MapPin size={14} />
              <input aria-label={tt.cityAria} value={city} onChange={(e) => setCity(e.target.value.slice(0, 80))}
                placeholder={tt.cityPh} maxLength={80} /></div></label>
            <button className="button button-primary search-button" disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
              {loading ? tt.searching : tt.explore}
            </button>
            <span className="demo-quota">{restante} {tt.left}</span>
          </form>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="results-toolbar">
            <span aria-live="polite"><strong>{filtered.length} {tt.opportunities}</strong><span className="result-location"> {tt.inCity} {searched ? query.city : city}</span></span>
            <div><button aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><ListFilter size={13} />{savedOnly ? tt.allBtn : tt.savedBtn}</button><button aria-label={tt.sortAria} onClick={() => setSort(!sort)}><ArrowDownUp size={13} /><span>Score</span></button><LayoutGrid size={14} className="grid-icon" /></div>
          </div>
          <div className={`lead-grid${loading ? " is-loading" : ""}`} aria-busy={loading}>
            {loading && <div className="demo-loading"><Loader2 size={20} className="spin" /><span>{tt.loadingReal}</span></div>}
            {!loading && filtered.map((lead, i) => {
              const key = leadKey(lead, i);
              return (
                <article className="lead-card" key={key}>
                  <div className="lead-top"><div className={`business-avatar ${COLORS[i % 3]}`}>{initials(lead.nome)}</div><button className={`bookmark-button${saved.includes(key) ? " is-saved" : ""}`} aria-label={`${saved.includes(key) ? tt.removeAria : tt.saveAria} ${lead.nome}`} onClick={() => setSaved(saved.includes(key) ? saved.filter((id) => id !== key) : [...saved, key])}><Bookmark size={16} fill={saved.includes(key) ? "currentColor" : "none"} /></button></div>
                  <h4>{lead.nome}</h4><p className="lead-location">{lead.categoria ?? query.niche} <span>·</span> {[lead.bairro, lead.cidade].filter(Boolean).join(", ") || city.split(",")[0]}</p>
                  <div className="lead-rating"><Star size={11} fill="currentColor" /> {rating(lead)} <span>{tt.rating}</span></div>
                  <div className="opportunity"><span><i /> {tt.strong}</span><strong>{lead.score}<small>/100</small></strong></div>
                  <div className="lead-signals"><span><Globe size={12} />{siteLabel(lead)}</span><span><MapPin size={12} />{tt.local}</span></div>
                  <div className="lead-signals lead-masked"><span><MessageCircle size={12} />{lead.whatsapp ?? "—"}</span><span><Instagram size={12} />{lead.instagram ?? "—"}</span><Lock size={11} /></div>
                  <div className="lead-domain"><Globe size={12} /><strong>{domainPreview(lead.nome)}</strong><em>{tt.domLbl}</em></div>
                  <button className="lead-action" onClick={() => { setActive(lead); setCopied(false); setCopyError(false); }}>{tt.view} <ArrowRight size={14} /></button>
                </article>
              );
            })}
            {!loading && leads !== null && filtered.length === 0 && (
              <div className="empty-state"><Bookmark size={24} /><strong>{savedOnly ? tt.emptyT : tt.noRes}</strong><p>{savedOnly ? tt.emptyP : tt.noResP}</p>{savedOnly && <button onClick={() => setSavedOnly(false)} className="text-link">{tt.view} <ArrowRight size={14} /></button>}</div>
            )}
            {!loading && leads === null && (
              <div className="empty-state"><Radar size={24} /><strong>{tt.loadingReal}</strong></div>
            )}
          </div>
          <div className="product-footnote"><span><span className="status-dot" /> {tt.footnote}</span><span>{tt.demoMode}</span></div>
        </div>
      </div>

      {/* Detalhe do lead real — contatos mascarados + exemplo de site */}
      <Dialog.Root open={Boolean(active)} onOpenChange={(open) => { if (!open) setActive(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="lead-dialog">
            <Dialog.Close className="dialog-close" aria-label="×"><X size={20} /></Dialog.Close>
            <span className="eyebrow">{tt.analysis}</span>
            <Dialog.Title>{active?.nome}</Dialog.Title>
            <Dialog.Description>{tt.dlgFor} {serviceLabel(query.service).toLowerCase()} {tt.inCity} {searched ? query.city : city}. {tt.dlgIn}</Dialog.Description>
            <div className="analysis-box"><Sparkles size={19} /><div><strong>{siteLabel(active ?? ({} as DemoResult))}</strong><p>{tt.analysisBody}</p></div></div>
            <h3>{tt.realTitle}</h3>
            <p className="dialog-text">{tt.signalsIntro}</p>
            <ul className="signal-list">
              <li><Globe size={14} /><span><strong>{tt.siteT}</strong> {siteLabel(active ?? ({} as DemoResult))} — {tt.siteB}</span></li>
              <li><MessageCircle size={14} /><span><strong>{tt.waT}</strong> {active?.whatsapp ?? tt.masked} — {tt.waB}</span></li>
              <li><Instagram size={14} /><span><strong>{tt.igT}</strong> {active?.instagram ?? tt.masked} — {tt.igB}</span></li>
              <li><Star size={14} /><span><strong>{tt.rateT}</strong> {active ? rating(active) : "—"} — {tt.rateB}</span></li>
            </ul>
            <p className="dialog-text">{tt.closing}</p>
            <h3>{tt.conv}</h3>
            <blockquote>{message}</blockquote>
            <div className="dialog-actions">
              <button className="button button-primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? tt.copied : tt.copy}</button>
              {site && (
                <a className="button button-glass" href={`/site/${site.slug}`} target="_blank" rel="noopener noreferrer">
                  <Globe size={15} />{tt.siteEx}
                </a>
              )}
            </div>
            {copyError && <p role="alert">{tt.copyErr}</p>}
            <p className="dialog-note">{tt.dlgNote}</p>
            {full && <BusinessToolsPreview service={query.service} t={tt.tools} />}
            <Link className="text-link" href="/cadastro">{tt.early} <ArrowUpRight size={15} /></Link>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Upsell após as 3 buscas grátis */}
      <Dialog.Root open={upsell} onOpenChange={setUpsell}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="lead-dialog demo-upsell">
            <Dialog.Close className="dialog-close" aria-label="×"><X size={20} /></Dialog.Close>
            <span className="eyebrow">{tt.pill}</span>
            <Dialog.Title>{tt.upsellT}</Dialog.Title>
            <Dialog.Description>{tt.upsellP}</Dialog.Description>
            <div className="dialog-actions">
              <Link className="button button-primary" href="/cadastro">{tt.upsellA} <ArrowUpRight size={15} /></Link>
              <Link className="button button-glass" href="/planos">{tt.upsellB}</Link>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
