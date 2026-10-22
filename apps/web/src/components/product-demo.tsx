"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowRight, ArrowUpRight, Bookmark, Check, Copy, Globe, Instagram, LayoutGrid, ListFilter, MapPin, MessageCircle, Radar, Search, Sparkles, Star, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { formatPotential, makeDemoLeads, type DemoLead } from "@/lib/catalog";
import { services } from "@/lib/service-catalog";
import { cityGroupsFor, nicheGroupsFor, serviceCategory, serviceName } from "@/lib/catalog-i18n";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/shared";
import { BusinessToolsPreview } from "./business-tools-preview";
import { FancySelect } from "./fancy-select";

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
  const [saved, setSaved] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState(false);
  const [active, setActive] = useState<DemoLead | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  // canonical PT do nicho atual — pesos do estimador e nomes demo
  const canonicalNiche = (label: string) =>
    nGroups.flatMap((g) => g.options).find((o) => o.label === label)?.canonical ?? label;
  const leads = makeDemoLeads(canonicalNiche(query.niche), query.service)
    .map((l) => ({ ...l, category: query.niche }));
  const filtered = leads.filter((lead) => !savedOnly || saved.includes(lead.id));
  if (sort) filtered.reverse();
  const serviceLabel = (id: string) => {
    const s = services.find((item) => item.id === id);
    return s ? serviceName(s.id, s.label, lang) : id;
  };
  const message = active
    ? tt.msg.replace("{name}", active.name).replace("{service}", serviceLabel(query.service).toLowerCase())
    : "";

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setQuery({ service, niche, city });
    setSaved([]);
    setSavedOnly(false);
    setLoading(false);
  }

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const area = document.createElement("textarea");
        area.value = message;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

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
            <label>{tt.where}<FancySelect ariaLabel={tt.cityAria} value={city} onChange={setCity} icon={<MapPin size={14} />}
              groups={cGroups.map((group) => ({
                label: group.region,
                options: group.cities.map((item) => ({
                  value: item.label,
                  label: item.label,
                  badge: formatPotential(item, canonicalNiche(niche), service),
                })),
              }))} /></label>
            <button className="button button-primary search-button" disabled={loading}><Search size={16} />{loading ? tt.searching : tt.explore}</button>
          </form>
          <div className="results-toolbar">
            <span aria-live="polite"><strong>{filtered.length} {tt.opportunities}</strong><span className="result-location"> {tt.inCity} {query.city}</span></span>
            <div><button aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><ListFilter size={13} />{savedOnly ? tt.allBtn : tt.savedBtn}</button><button aria-label={tt.sortAria} onClick={() => setSort(!sort)}><ArrowDownUp size={13} /><span>Score</span></button><LayoutGrid size={14} className="grid-icon" /></div>
          </div>
          <div className={`lead-grid${loading ? " is-loading" : ""}`} aria-busy={loading}>
            {filtered.map((lead) => (
              <article className="lead-card" key={lead.id}>
                <div className="lead-top"><div className={`business-avatar ${lead.color}`}>{lead.initials}</div><button className={`bookmark-button${saved.includes(lead.id) ? " is-saved" : ""}`} aria-label={`${saved.includes(lead.id) ? tt.removeAria : tt.saveAria} ${lead.name}`} onClick={() => setSaved(saved.includes(lead.id) ? saved.filter((id) => id !== lead.id) : [...saved, lead.id])}><Bookmark size={16} fill={saved.includes(lead.id) ? "currentColor" : "none"} /></button></div>
                <h4>{lead.name}</h4><p className="lead-location">{lead.category} <span>·</span> {query.city.split(",")[0]}</p>
                <div className="lead-rating"><Star size={11} fill="currentColor" /> 4,8 <span>{tt.rating}</span></div>
                <div className="opportunity"><span><i /> {tt.strong}</span><strong>{lead.score}<small>/100</small></strong></div>
                <div className="lead-signals"><span><Globe size={12} />{lead.issue}</span><span><MapPin size={12} />{tt.local}</span></div>
                <button className="lead-action" onClick={() => { setActive(lead); setCopied(false); setCopyError(false); }}>{tt.view} <ArrowRight size={14} /></button>
              </article>
            ))}
            {filtered.length === 0 && <div className="empty-state"><Bookmark size={24} /><strong>{tt.emptyT}</strong><p>{tt.emptyP}</p><button onClick={() => setSavedOnly(false)} className="text-link">{tt.view} <ArrowRight size={14} /></button></div>}
          </div>
          <div className="product-footnote"><span><span className="status-dot" /> {tt.footnote}</span><span>{tt.demoMode}</span></div>
        </div>
      </div>
      <Dialog.Root open={Boolean(active)} onOpenChange={(open) => { if (!open) setActive(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="lead-dialog">
            <Dialog.Close className="dialog-close" aria-label="×"><X size={20} /></Dialog.Close>
            <span className="eyebrow">{tt.analysis}</span>
            <Dialog.Title>{active?.name}</Dialog.Title>
            <Dialog.Description>{tt.dlgFor} {serviceLabel(query.service).toLowerCase()} {tt.inCity} {query.city}. {tt.dlgIn}</Dialog.Description>
            <div className="analysis-box"><Sparkles size={19} /><div><strong>{active?.issue}</strong><p>{tt.analysisBody}</p></div></div>
            <h3>{tt.realTitle}</h3>
            <p className="dialog-text">{tt.signalsIntro}</p>
            <ul className="signal-list">
              <li><Globe size={14} /><span><strong>{tt.siteT}</strong> {tt.siteB}</span></li>
              <li><MessageCircle size={14} /><span><strong>{tt.waT}</strong> {tt.waB}</span></li>
              <li><Instagram size={14} /><span><strong>{tt.igT}</strong> {tt.igB}</span></li>
              <li><Star size={14} /><span><strong>{tt.rateT}</strong> {tt.rateB}</span></li>
            </ul>
            <p className="dialog-text">{tt.closing}</p>
            <h3>{tt.conv}</h3>
            <blockquote>{message}</blockquote>
            <button className="button button-primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? tt.copied : tt.copy}</button>
            {copyError && <p role="alert">{tt.copyErr}</p>}
            <p className="dialog-note">{tt.dlgNote}</p>
            {full && <BusinessToolsPreview service={query.service} t={tt.tools} />}
            <Link className="text-link" href="/cadastro">{tt.early} <ArrowUpRight size={15} /></Link>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
