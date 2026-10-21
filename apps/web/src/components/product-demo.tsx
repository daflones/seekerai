"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowRight, Bookmark, Check, Copy, Globe, LayoutGrid, ListFilter, MapPin, Radar, Search, Sparkles, Star, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cityGroups, formatPotential, makeDemoLeads, nicheGroups, services, type DemoLead } from "@/lib/catalog";
import { serviceCategories } from "@/lib/service-catalog";
import { BusinessToolsPreview } from "./business-tools-preview";
import { FancySelect } from "./fancy-select";

export function ProductDemo({ full = false }: { full?: boolean }) {
  const [service, setService] = useState("sites");
  const [niche, setNiche] = useState<string>("Barbearias");
  const [city, setCity] = useState<string>("São Paulo, SP");
  const [query, setQuery] = useState({ service: "sites", niche: "Barbearias", city: "São Paulo, SP" });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState(false);
  const [active, setActive] = useState<DemoLead | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const leads = makeDemoLeads(query.niche, query.service);
  const filtered = leads.filter((lead) => !savedOnly || saved.includes(lead.id));
  if (sort) filtered.reverse();
  const message = active
    ? `Olá, equipe da ${active.name}! Trabalho com ${services.find((item) => item.id === query.service)?.label.toLowerCase()}. Gostaria de entender como vocês cuidam dessa parte hoje. Posso apresentar uma ideia?`
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
      await navigator.clipboard.writeText(message);
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
        <span><span className="chrome-lock">◇</span> seekerai / encontrar oportunidades</span>
        <span className="demo-pill"><span /> DEMONSTRAÇÃO</span>
      </div>
      <div className="product-layout">
        <aside className="product-sidebar" aria-label="Visualizações da demonstração">
          <div className="sidebar-symbol"><Radar size={22} /></div>
          <button className={!savedOnly ? "selected" : ""} aria-label="Todas as oportunidades" onClick={() => setSavedOnly(false)}><Search size={19} /></button>
          <button className={savedOnly ? "selected" : ""} aria-label="Ver exemplos salvos" onClick={() => setSavedOnly(true)}><Bookmark size={19} /></button>
          <div className="sidebar-bottom">S</div>
        </aside>
        <div className="product-content">
          <div className="product-heading">
            <div><span className="tiny-label">SEU RADAR DE NOVOS NEGÓCIOS</span><h3>Encontre sua próxima oportunidade<span>.</span></h3></div>
            <span className="example-tag"><Sparkles size={12} /> Dados ilustrativos</span>
          </div>
          <form className="search-form" onSubmit={search}>
            <label>Eu ofereço<FancySelect ariaLabel="Serviço que você oferece" value={service} onChange={setService}
              groups={serviceCategories.map((category) => ({
                label: category,
                options: services.filter((item) => item.category === category)
                  .map((item) => ({ value: item.id, label: item.label })),
              }))} /></label>
            <label>Quero encontrar<FancySelect ariaLabel="Tipo de estabelecimento" value={niche} onChange={setNiche}
              groups={nicheGroups.map((group) => ({
                label: group.label,
                options: group.niches.map((item) => ({ value: item, label: item })),
              }))} /></label>
            <label>Onde?<FancySelect ariaLabel="Cidade ou estado" value={city} onChange={setCity} icon={<MapPin size={14} />}
              groups={cityGroups.map((group) => ({
                label: group.region,
                options: group.cities.map((item) => ({
                  value: item.label,
                  label: item.label,
                  badge: formatPotential(item, niche, service),
                })),
              }))} /></label>
            <button className="button button-primary search-button" disabled={loading}><Search size={16} />{loading ? "Buscando..." : "Explorar exemplo"}</button>
          </form>
          <div className="results-toolbar">
            <span aria-live="polite"><strong>{filtered.length} oportunidades</strong><span className="result-location"> em {query.city}</span></span>
            <div><button aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><ListFilter size={13} />{savedOnly ? "Todos" : "Salvos"}</button><button aria-label="Inverter ordem de oportunidade" onClick={() => setSort(!sort)}><ArrowDownUp size={13} /><span>Score</span></button><LayoutGrid size={14} className="grid-icon" /></div>
          </div>
          <div className={`lead-grid${loading ? " is-loading" : ""}`} aria-busy={loading}>
            {filtered.map((lead) => (
              <article className="lead-card" key={lead.id}>
                <div className="lead-top"><div className={`business-avatar ${lead.color}`}>{lead.initials}</div><button className={`bookmark-button${saved.includes(lead.id) ? " is-saved" : ""}`} aria-label={`${saved.includes(lead.id) ? "Remover" : "Salvar"} ${lead.name}`} onClick={() => setSaved(saved.includes(lead.id) ? saved.filter((id) => id !== lead.id) : [...saved, lead.id])}><Bookmark size={16} fill={saved.includes(lead.id) ? "currentColor" : "none"} /></button></div>
                <h4>{lead.name}</h4><p className="lead-location">{lead.category} <span>·</span> {query.city.split(",")[0]}</p>
                <div className="lead-rating"><Star size={11} fill="currentColor" /> 4,8 <span>avaliação ilustrativa</span></div>
                <div className="opportunity"><span><i /> Forte oportunidade</span><strong>{lead.score}<small>/100</small></strong></div>
                <div className="lead-signals"><span><Globe size={12} />{lead.issue}</span><span><MapPin size={12} />Negócio local</span></div>
                <button className="lead-action" onClick={() => { setActive(lead); setCopied(false); setCopyError(false); }}>Ver oportunidade <ArrowRight size={14} /></button>
              </article>
            ))}
            {filtered.length === 0 && <div className="empty-state"><Bookmark size={24} /><strong>Seu radar começa por aqui.</strong><p>Salve um exemplo para encontrá-lo nesta visualização.</p><button onClick={() => setSavedOnly(false)} className="text-link">Ver oportunidades <ArrowRight size={14} /></button></div>}
          </div>
          <div className="product-footnote"><span><span className="status-dot" /> Seu próximo cliente pode estar mais perto do que você imagina.</span><span>Modo demonstração</span></div>
        </div>
      </div>
      <Dialog.Root open={Boolean(active)} onOpenChange={(open) => { if (!open) setActive(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="lead-dialog">
            <Dialog.Close className="dialog-close" aria-label="Fechar análise"><X size={20} /></Dialog.Close>
            <span className="eyebrow">ANÁLISE ILUSTRATIVA</span>
            <Dialog.Title>{active?.name}</Dialog.Title>
            <Dialog.Description>Exemplo fictício para {services.find((item) => item.id === query.service)?.label.toLowerCase()} em {query.city}. Não é uma análise de um estabelecimento real.</Dialog.Description>
            <div className="analysis-box"><Sparkles size={19} /><div><strong>{active?.issue}</strong><p>Em uma busca real, os sinais disponíveis ajudam a entender se existe uma oportunidade. Confirme as necessidades do negócio antes de propor uma solução.</p></div></div>
            <h3>Uma conversa começa com contexto.</h3>
            <blockquote>{message}</blockquote>
            <button className="button button-primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Mensagem copiada" : "Copiar mensagem de exemplo"}</button>
            {copyError && <p role="alert">Não foi possível copiar automaticamente. Selecione e copie o texto da mensagem.</p>}
            <p className="dialog-note">Nenhum contato real é usado nesta demonstração. As integrações serão habilitadas nas próximas fases.</p>
            {full && <BusinessToolsPreview service={query.service} />}
            <Link className="text-link" href="/cadastro">Conhecer o acesso antecipado <ArrowRight size={15} /></Link>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
