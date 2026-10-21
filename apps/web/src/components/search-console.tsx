"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkPlus, CheckCircle2, ExternalLink, Instagram, Loader2, Lock, MapPin, MessageCircle, Phone, Search, Star, Globe } from "lucide-react";
import { callAction, placeImageSrc, type PlaceResult } from "@/lib/app-client";
import { cityGroups, formatPotential, nicheGroups } from "@/lib/catalog";
import { FancySelect } from "./fancy-select";

interface SearchResponse {
  resultados: PlaceResult[];
  provedor?: string;
  replay?: boolean;
  runOriginal?: string;
  creditosCobrados?: number;
  error?: string;
}

export function SearchConsole({
  services,
  canSearch = true,
}: {
  services: { slug: string; nome: string; categoria: string }[];
  canSearch?: boolean;
}) {
  const [service, setService] = useState(services[0]?.slug ?? "");
  const [niche, setNiche] = useState("Barbearias");
  const [city, setCity] = useState("São Paulo, SP");
  const [refine, setRefine] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [meta, setMeta] = useState<{ provedor?: string; replay?: boolean; creditos?: number } | null>(null);
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function search() {
    const q = `${niche} em ${city}${refine.trim() ? `, ${refine.trim()}` : ""}`;
    if (!canSearch || !service || busy) return;
    setBusy(true);
    setError("");
    setSaved({});
    const res = await callAction<SearchResponse>("places-search", {
      query: q,
      serviceSlug: service,
      requestRef: crypto.randomUUID(),
      regionCode: "BR",
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); setResults(null); return; }
    setResults(res.data.resultados ?? []);
    setMeta({
      provedor: res.data.provedor,
      replay: res.data.replay,
      creditos: res.data.creditosCobrados,
    });
  }

  async function saveLead(place: PlaceResult, index: number) {
    if (saving !== null || saved[index]) return;
    setSaving(index);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...place, serviceSlug: service, dados: place }),
    });
    const data = (await res.json().catch(() => null)) as { lead?: { id: string }; error?: string } | null;
    setSaving(null);
    if (!res.ok || !data?.lead) {
      setError(data?.error ?? "Não foi possível salvar o lead.");
      return;
    }
    setSaved((s) => ({ ...s, [index]: data.lead!.id }));
  }

  return <div className="seek-console">
    <form className="seek-form" onSubmit={(e) => { e.preventDefault(); void search(); }}>
      <label className="seek-field">
        <span>O que você vende</span>
        <FancySelect ariaLabel="Serviço que você vende" value={service} onChange={setService}
          groups={[...new Set(services.map((s) => s.categoria))].map((categoria) => ({
            label: categoria,
            options: services.filter((s) => s.categoria === categoria)
              .map((s) => ({ value: s.slug, label: s.nome })),
          }))} />
      </label>
      <label className="seek-field">
        <span>Nicho</span>
        <FancySelect ariaLabel="Tipo de estabelecimento" value={niche} onChange={setNiche}
          groups={nicheGroups.map((group) => ({
            label: group.label,
            options: group.niches.map((item) => ({ value: item, label: item })),
          }))} />
      </label>
      <label className="seek-field seek-field-grow">
        <span>Cidade</span>
        <FancySelect ariaLabel="Cidade" value={city} onChange={setCity} icon={<MapPin size={14} />}
          groups={cityGroups.map((group) => ({
            label: group.region,
            options: group.cities.map((item) => ({
              value: item.label,
              label: item.label,
              badge: formatPotential(item, niche, service),
            })),
          }))} />
      </label>
      <label className="seek-field seek-field-refine">
        <span>Refinar <em>(opcional)</em></span>
        <input
          value={refine}
          onChange={(e) => setRefine(e.target.value)}
          placeholder="Ex.: bairro Moema"
          maxLength={120}
        />
      </label>
      {canSearch
        ? <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
            {busy ? "Buscando…" : "Buscar"}
          </button>
        : <Link href="/app/planos" className="button button-primary"><Lock size={15} />Assinar para buscar</Link>}
    </form>

    {!canSearch && <div className="seek-locked" role="note">
      <Lock size={18} />
      <div>
        <strong>A busca de empresas faz parte dos planos pagos.</strong>
        <p>Assinando, o radar traz estabelecimentos reais com WhatsApp verificado, sinais de oportunidade e a mensagem pronta.</p>
        <Link href="/app/planos" className="text-link">Ver planos <ExternalLink size={12} /></Link>
      </div>
    </div>}

    {error && <p role="alert" className="auth-error">{error}</p>}

    {meta && results !== null && <p className="seek-meta">
      {results.length} estabelecimento{results.length === 1 ? "" : "s"} encontrado{results.length === 1 ? "" : "s"}
      {meta.creditos ? ` · ${meta.creditos} créditos` : ""}
      {meta.replay && <strong className="seek-replay-tag"> · demonstração (replay)</strong>}
    </p>}

    {results !== null && results.length === 0 && !error &&
      <p className="seek-empty">Nenhum resultado. Tente outra combinação de nicho e cidade.</p>}

    <div className="seek-grid">
      {(results ?? []).map((p, i) => <article key={p.id ?? i} className="seek-card">
        {p.imagem
          ? <div className="seek-card-img" style={{ backgroundImage: `url(${placeImageSrc(p.imagem)})` }} role="img" aria-label={p.nome ?? "Estabelecimento"} />
          : <div className="seek-card-img seek-card-img-empty" aria-hidden><MapPin size={22} /></div>}
        <div className="seek-card-body">
          <div className="seek-card-top">
            <h3>{p.nome ?? "Sem nome"}</h3>
            {p.avaliacao !== null && <span className="seek-score"><Star size={12} />{p.avaliacao.toFixed(1)}{p.totalAvaliacoes ? ` (${p.totalAvaliacoes})` : ""}</span>}
          </div>
          {p.categoria && <span className="seek-category">{p.categoria}</span>}
          {p.endereco && <p className="seek-line"><MapPin size={12} />{[p.endereco, p.cidade, p.uf].filter(Boolean).join(" · ")}</p>}
          {p.telefone && <p className="seek-line"><Phone size={12} />{p.telefone}</p>}
          <div className="seek-badges">
            {p.site
              ? <a className="seek-badge seek-badge-ok" href={p.site} target="_blank" rel="noopener noreferrer"><Globe size={11} />Tem site</a>
              : <span className="seek-badge seek-badge-gap">Sem site — oportunidade</span>}
            {p.whatsapp === true && <span className="seek-badge seek-badge-ok"><MessageCircle size={11} />WhatsApp ativo</span>}
            {p.whatsapp === false && p.telefone && <span className="seek-badge">Sem WhatsApp</span>}
            {p.instagram && <a className="seek-badge" href={`https://instagram.com/${p.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"><Instagram size={11} />{p.instagram}</a>}
            {p.status === "CLOSED_PERMANENTLY" && <span className="seek-badge">Fechado</span>}
          </div>
          <div className="seek-card-actions">
            {saved[i]
              ? <Link className="button button-glass button-small" href={`/app/leads/${saved[i]}`}><CheckCircle2 size={14} />Ver lead</Link>
              : <button type="button" className="button button-glass button-small" disabled={saving !== null}
                  onClick={() => void saveLead(p, i)}>
                  {saving === i ? <Loader2 size={14} className="spin" /> : <BookmarkPlus size={14} />}Salvar lead</button>}
            {p.mapsUrl && <a className="text-link" href={p.mapsUrl} target="_blank" rel="noopener noreferrer">Maps<ExternalLink size={12} /></a>}
          </div>
        </div>
      </article>)}
    </div>
  </div>;
}
