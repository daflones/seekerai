"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkPlus, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink,
  Globe, Heart, Instagram, Loader2, Lock, MapPin, MessageCircle, Phone,
  Search, SlidersHorizontal, Star, Users,
} from "lucide-react";
import { placeImageSrc, type PlaceResult } from "@/lib/app-client";
import { formatPotential } from "@/lib/catalog";
import { cityGroupsFor, nicheGroupsFor, serviceCategory, serviceName } from "@/lib/catalog-i18n";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/shared";
import { FancySelect } from "./fancy-select";

const PAGE_SIZE = 9;
const STORE_KEY = "seekerai_search_v1";

function fmtCompact(n: number, lang: string): string {
  return new Intl.NumberFormat(lang === "pt" ? "pt-BR" : lang, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

interface SearchResponse {
  resultados: PlaceResult[];
  provedor?: string;
  replay?: boolean;
  runOriginal?: string;
  creditosCobrados?: number;
}

interface SearchJob {
  id: string;
  status: "running" | "done" | "error";
  result?: SearchResponse | null;
  erro?: string | null;
  created_at: string;
}

interface StoredState {
  jobId: string | null;
  results: PlaceResult[] | null;
  meta: { provedor?: string; replay?: boolean; creditos?: number } | null;
}

function siteCheckBadge(check: NonNullable<PlaceResult["siteCheck"]>, t: Messages["seek"]) {
  const label = {
    bom: t.siteBom,
    ok: t.siteOk,
    desatualizado: t.siteOld,
    fora: t.siteOut,
  }[check.estado];
  const cls = check.estado === "bom" ? "seek-badge-ok"
    : check.estado === "ok" ? ""
    : "seek-badge-gap";
  return { label, cls, sinais: check.sinais.join(" · ") };
}

export function SearchConsole({
  services,
  canSearch = true,
  freeSearchesLeft = null,
  t = getMessages("pt").seek,
  loc,
}: {
  services: { slug: string; nome: string; categoria: string }[];
  canSearch?: boolean;
  freeSearchesLeft?: number | null;
  t?: Messages["seek"];
  loc?: Locale;
}) {
  const locale: Locale = loc ?? { lang: "pt", region: "BR", currency: "brl", isBrazil: true };
  const lang = locale.lang;
  const nGroups = nicheGroupsFor(lang);
  const cGroups = cityGroupsFor(locale);
  // Nicho/cidade exibidos localizados; o canônico PT alimenta pesos e a query pro provedor.
  const canonicalNiche = (label: string) =>
    nGroups.flatMap((g) => g.options).find((o) => o.label === label)?.canonical ?? label;
  const router = useRouter();
  const [service, setService] = useState(services[0]?.slug ?? "");
  const [niche, setNiche] = useState(nGroups[0].options[0].label);
  const [city, setCity] = useState(cGroups[0].cities[0].label);
  const [refine, setRefine] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [meta, setMeta] = useState<{ provedor?: string; replay?: boolean; creditos?: number } | null>(null);
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<number | "all" | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [chips, setChips] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState("oportunidade");
  const poller = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persistência: resultado e job ativo sobrevivem a troca de página/aba.
  function store(state: StoredState) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* quota */ }
  }

  function stopPolling() {
    if (poller.current) { clearInterval(poller.current); poller.current = null; }
  }

  function applyDone(data: SearchResponse, jobId: string | null) {
    const list = data.resultados ?? [];
    const m = { provedor: data.provedor, replay: data.replay, creditos: data.creditosCobrados };
    setResults(list);
    setMeta(m);
    setBusy(false);
    setSaved({});
    setSelected(new Set());
    setPage(1);
    store({ jobId, results: list, meta: m });
    router.refresh(); // atualiza o chip de créditos
  }

  function pollJob(jobId: string) {
    stopPolling();
    setBusy(true);
    poller.current = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/search-jobs/${jobId}`, { cache: "no-store" });
          const data = (await res.json().catch(() => null)) as { job?: SearchJob } | null;
          if (!res.ok || !data?.job) return;
          const job = data.job;
          if (job.status === "done" && job.result) {
            stopPolling();
            applyDone(job.result, jobId);
          } else if (job.status === "error") {
            stopPolling();
            setBusy(false);
            setError(job.erro ?? t.errSearch);
            store({ jobId: null, results: null, meta: null });
          }
        } catch { /* tenta de novo no próximo tick */ }
      })();
    }, 3000);
  }

  function search() {
    if (!canSearch || !service || busy) return;
    // Resultados não salvos na tela: pergunta se quer guardar antes de sumir com eles.
    const unsaved = results?.some((_, i) => !saved[i]);
    if (unsaved) { setConfirming(true); return; }
    void doSearch();
  }

  async function doSearch() {
    const q = `${niche} ${lang === "pt" ? "em" : "in"} ${city}${refine.trim() ? `, ${refine.trim()}` : ""}`;
    setConfirming(false);
    setResults(null);
    setMeta(null);
    setSaved({});
    setSelected(new Set());
    setPage(1);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          serviceSlug: service,
          requestRef: crypto.randomUUID(),
          regionCode: locale.region,
        }),
      });
      const data = (await res.json().catch(() => null)) as { jobId?: string; error?: string } | null;
      if (!res.ok || !data?.jobId) {
        setBusy(false);
        setError(data?.error ?? t.errSearch);
        return;
      }
      store({ jobId: data.jobId, results: null, meta: null });
      pollJob(data.jobId);
    } catch {
      setBusy(false);
      setError(t.errNet);
    }
  }

  // Ao voltar pra página: retoma o job em andamento ou restaura o último resultado.
  useEffect(() => {
    let restored: StoredState | null = null;
    try {
      restored = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null") as StoredState | null;
    } catch { /* ignora */ }
    if (restored?.results) {
      setResults(restored.results);
      setMeta(restored.meta);
    }
    if (restored?.jobId) {
      pollJob(restored.jobId);
      return stopPolling;
    }
    // Sem estado salvo: pergunta se há job recente rodando (ex.: abriu em outra aba).
    void (async () => {
      try {
        const res = await fetch("/api/search-jobs?latest=1", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { job?: SearchJob | null } | null;
        if (data?.job?.status === "running") {
          store({ jobId: data.job.id, results: null, meta: null });
          pollJob(data.job.id);
        }
      } catch { /* sem job */ }
    })();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSelect(index: number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!results) return;
    const selectable = results.map((_, i) => i).filter((i) => !saved[i]);
    setSelected((cur) => cur.size === selectable.length ? new Set() : new Set(selectable));
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
      setError(data?.error ?? t.errSave);
      return;
    }
    setSaved((s) => ({ ...s, [index]: data.lead!.id }));
  }

  async function saveIndexes(indexes: number[]): Promise<boolean> {
    if (!results || indexes.length === 0) return true;
    setSaving("all");
    const items = indexes.map((i) => results[i]).filter(Boolean);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceSlug: service, leads: items }),
    });
    const data = (await res.json().catch(() => null)) as
      { leads?: (string | null)[]; salvos?: number; error?: string } | null;
    setSaving(null);
    if (!res.ok || !data?.leads) {
      setError(data?.error ?? t.errSave);
      return false;
    }
    setSaved((s) => {
      const next = { ...s };
      indexes.forEach((idx, k) => {
        const id = data.leads![k];
        if (id) next[idx] = id;
      });
      return next;
    });
    setSelected((cur) => { const next = new Set(cur); indexes.forEach((i) => next.delete(i)); return next; });
    return true;
  }

  function unsavedIndexes(): number[] {
    return (results ?? []).map((_, i) => i).filter((i) => !saved[i]);
  }

  // Filtros de oportunidade — dados do Instagram vem do scrape da busca.
  const FILTER_CHIPS: { key: string; label: string; test: (p: PlaceResult) => boolean }[] = [
    { key: "semSite", label: t.fNoSite, test: (p) => !p.site },
    { key: "comWa", label: t.fWa, test: (p) => p.whatsapp === true },
    { key: "semIg", label: t.fNoIg, test: (p) => !p.instagram },
    { key: "igFraco", label: t.fIgWeak, test: (p) => Boolean(p.instagram) && (p.ig?.seguidores ?? 0) < 5000 },
    { key: "poucasCurtidas", label: t.fLowLikes, test: (p) => Boolean(p.instagram) && (p.ig?.curtidas ?? 0) < 30 },
  ];
  const SORTS: { value: string; label: string; by: (a: PlaceResult, b: PlaceResult) => number }[] = [
    { value: "oportunidade", label: t.sortOpp, by: () => 0 },
    { value: "seguidores", label: t.sortFollowers, by: (a, b) => (a.ig?.seguidores ?? Infinity) - (b.ig?.seguidores ?? Infinity) },
    { value: "curtidas", label: t.sortLikes, by: (a, b) => (a.ig?.curtidas ?? Infinity) - (b.ig?.curtidas ?? Infinity) },
    { value: "nota", label: t.sortRating, by: (a, b) => (b.avaliacao ?? 0) - (a.avaliacao ?? 0) },
  ];
  function toggleChip(key: string) {
    setChips((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setPage(1);
  }
  const filtered = (results ?? [])
    .filter((p) => FILTER_CHIPS.every((c) => !chips.has(c.key) || c.test(p)))
    .sort(SORTS.find((s) => s.value === sort)?.by ?? SORTS[0].by);

  const pageCount = results ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectableCount = results ? results.filter((_, i) => !saved[i]).length : 0;

  return <div className="seek-console">
    <form className="seek-form" onSubmit={(e) => { e.preventDefault(); void search(); }}>
      <label className="seek-field">
        <span>{t.fService}</span>
        <FancySelect ariaLabel={t.fServiceAria} value={service} onChange={setService}
          groups={[...new Set(services.map((s) => s.categoria))].map((categoria) => ({
            label: serviceCategory(categoria, lang),
            options: services.filter((s) => s.categoria === categoria)
              .map((s) => ({ value: s.slug, label: serviceName(s.slug, s.nome, lang) })),
          }))} />
      </label>
      <label className="seek-field">
        <span>{t.fNiche}</span>
        <FancySelect ariaLabel={t.fNicheAria} value={niche} onChange={setNiche}
          groups={nGroups.map((group) => ({
            label: group.label,
            options: group.options.map((o) => ({ value: o.label, label: o.label })),
          }))} />
      </label>
      <label className="seek-field seek-field-grow">
        <span>{t.fCity}</span>
        <FancySelect ariaLabel={t.fCity} value={city} onChange={setCity} icon={<MapPin size={14} />}
          groups={cGroups.map((group) => ({
            label: group.region,
            options: group.cities.map((item) => ({
              value: item.label,
              label: item.label,
              badge: formatPotential(item, canonicalNiche(niche), service),
            })),
          }))} />
      </label>
      <label className="seek-field seek-field-refine">
        <span>{t.fRefine} <em>{t.fRefineOpt}</em></span>
        <input
          value={refine}
          onChange={(e) => setRefine(e.target.value)}
          placeholder={t.fRefinePh}
          maxLength={120}
        />
      </label>
      {canSearch
        ? <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
            {busy ? t.searching : t.search}
          </button>
        : <Link href="/app/planos" className="button button-primary"><Lock size={15} />{t.subscribe}</Link>}
    </form>

    {canSearch && freeSearchesLeft !== null && <p className="seek-meta seek-free-left" role="note">
      {freeSearchesLeft === 1 ? t.freeLast : `${freeSearchesLeft} ${t.freeLeft}`}
    </p>}

    {!canSearch && <div className="seek-locked" role="note">
      <Lock size={18} />
      <div>
        <strong>{t.lockedT}</strong>
        <p>{t.lockedP}</p>
        <Link href="/app/planos" className="text-link">{t.lockedLink} <ExternalLink size={12} /></Link>
      </div>
    </div>}

    {busy && <p className="seek-meta seek-running" role="status">
      <Loader2 size={13} className="spin" /> {t.running}
    </p>}
    {error && <p role="alert" className="auth-error">{error}</p>}

    {meta && results !== null && !busy && <p className="seek-meta">
      {results.length} {results.length === 1 ? t.foundOne : t.found}
      {meta.replay && <strong className="seek-replay-tag">{t.replay}</strong>}
    </p>}

    {results !== null && results.length === 0 && !error && !busy &&
      <p className="seek-empty">{t.empty}</p>}

    {results !== null && results.length > 0 && <div className="seek-bulkbar">
      <label className="seek-check">
        <input type="checkbox"
          checked={selectableCount > 0 && selected.size === selectableCount}
          onChange={toggleSelectAll} />
        <span>{selected.size === 0 ? t.selectAll : `${selected.size} ${t.selected}`}</span>
      </label>
      {selected.size > 0 && <button type="button" className="button button-primary button-small"
        disabled={saving !== null} onClick={() => void saveIndexes([...selected])}>
        {saving === "all" ? <Loader2 size={13} className="spin" /> : <BookmarkPlus size={13} />}
        {t.saveLeads} {selected.size} {t.leadsW}
      </button>}
    </div>}

    {results !== null && results.length > 0 && <div className="seek-filters" role="group" aria-label={t.filters}>
      <span className="seek-filters-label"><SlidersHorizontal size={12} />{t.filters}</span>
      {FILTER_CHIPS.map((c) => (
        <button key={c.key} type="button"
          className={`seek-chip${chips.has(c.key) ? " active" : ""}`}
          aria-pressed={chips.has(c.key)}
          onClick={() => toggleChip(c.key)}>
          {c.label}
        </button>
      ))}
      <span className="seek-filters-sort">
        <FancySelect ariaLabel={t.sortBy} value={sort} onChange={(v) => { setSort(v); setPage(1); }}
          groups={[{ label: t.sortBy, options: SORTS.map((s) => ({ value: s.value, label: s.label })) }]} />
      </span>
    </div>}
    {results !== null && filtered.length === 0 && !busy && <p className="seek-empty">{t.noneHere}</p>}

    <div className="seek-grid">
      {pageItems.map((p) => {
        const i = results!.indexOf(p);
        const check = p.siteCheck ? siteCheckBadge(p.siteCheck, t) : null;
        return <article key={p.id ?? i} className={`seek-card${selected.has(i) ? " selected" : ""}`}>
          <button type="button" className="seek-card-check" aria-label={t.selectAll}
            aria-pressed={selected.has(i)} onClick={() => toggleSelect(i)}>
            {selected.has(i) ? <CheckCircle2 size={17} /> : <span className="seek-check-dot" />}
          </button>
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
              {p.site && check
                ? <a className={`seek-badge ${check.cls}`} href={p.site} target="_blank" rel="noopener noreferrer" title={check.sinais}><Globe size={11} />{check.label}</a>
                : p.site
                ? <a className="seek-badge seek-badge-ok" href={p.site} target="_blank" rel="noopener noreferrer"><Globe size={11} />{t.hasSite}</a>
                : <span className="seek-badge seek-badge-gap">{t.noSite}</span>}
              {check && check.sinais && p.siteCheck!.estado !== "bom" &&
                <span className="seek-badge seek-site-note" title={check.sinais}>{check.sinais.split(" · ")[0]}</span>}
              {p.whatsapp === true && <span className="seek-badge seek-badge-ok"><MessageCircle size={11} />{t.waOk}</span>}
              {p.whatsapp === false && p.telefone && <span className="seek-badge">{t.waNo}</span>}
              {p.instagram && !p.ig && <a className="seek-badge" href={`https://instagram.com/${p.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"><Instagram size={11} />{p.instagram}</a>}
              {p.status === "CLOSED_PERMANENTLY" && <span className="seek-badge">{t.closed}</span>}
            </div>
            {p.ig && <a className="seek-ig" href={`https://instagram.com/${p.instagram!.replace(/^@/, "")}`}
              target="_blank" rel="noopener noreferrer" title={p.ig.bio ?? p.instagram ?? ""}>
              {p.ig.foto
                // eslint-disable-next-line @next/next/no-img-element -- CDN do Instagram
                ? <img className="seek-ig-pic" src={p.ig.foto} alt="" loading="lazy" />
                : <span className="seek-ig-pic seek-ig-pic-empty"><Instagram size={12} /></span>}
              <span className="seek-ig-handle">{p.instagram}</span>
              {p.ig.seguidores !== null && <span className="seek-ig-stat"><Users size={11} />{fmtCompact(p.ig.seguidores, lang)} {t.igFollowers}</span>}
              {p.ig.posts !== null && <span className="seek-ig-stat">{fmtCompact(p.ig.posts, lang)} {t.igPosts}</span>}
              {p.ig.curtidas !== null && <span className="seek-ig-stat"><Heart size={11} />{fmtCompact(p.ig.curtidas, lang)} {t.igLikes}</span>}
            </a>}
            <div className="seek-card-actions">
              {saved[i]
                ? <Link className="button button-glass button-small" href={`/app/leads/${saved[i]}`}><CheckCircle2 size={14} />{t.viewLead}</Link>
                : <button type="button" className="button button-glass button-small" disabled={saving !== null}
                    onClick={() => void saveLead(p, i)}>
                    {saving === i ? <Loader2 size={14} className="spin" /> : <BookmarkPlus size={14} />}{t.saveLead}</button>}
              {p.mapsUrl && <a className="text-link" href={p.mapsUrl} target="_blank" rel="noopener noreferrer">Maps<ExternalLink size={12} /></a>}
            </div>
          </div>
        </article>;
      })}
    </div>

    {pageCount > 1 && <nav className="lead-pager" aria-label={t.pagerAria}>
      <button type="button" className="button button-glass button-small" disabled={page <= 1}
        onClick={() => setPage((p) => Math.max(1, p - 1))}>
        <ChevronLeft size={14} /> {t.prev}
      </button>
      <span className="lead-pager-info">{page} / {pageCount}</span>
      <button type="button" className="button button-glass button-small" disabled={page >= pageCount}
        onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
        {t.next} <ChevronRight size={14} />
      </button>
    </nav>}

    {confirming && <div className="pix-overlay" role="dialog" aria-modal="true" aria-label={t.confirmT}
      onClick={() => setConfirming(false)}>
      <section className="pix-panel seek-confirm" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pix-close" aria-label="×" onClick={() => setConfirming(false)}>×</button>
        <h2><Search size={18} /> {t.confirmT}</h2>
        <p className="seek-meta">
          <strong>{unsavedIndexes().length}</strong> {t.confirmP}
        </p>
        <div className="seek-confirm-actions">
          {selected.size > 0 && <button type="button" className="button button-primary"
            disabled={saving !== null}
            onClick={() => void (async () => {
              if (await saveIndexes([...selected])) void doSearch();
            })()}>
            {saving === "all" ? <Loader2 size={14} className="spin" /> : <BookmarkPlus size={14} />}
            {t.saveLeads} {selected.size} {t.confirmSaveSel}
          </button>}
          <button type="button" className="button button-primary"
            disabled={saving !== null}
            onClick={() => void (async () => {
              if (await saveIndexes(unsavedIndexes())) void doSearch();
            })()}>
            {saving === "all" ? <Loader2 size={14} className="spin" /> : <BookmarkPlus size={14} />}
            {t.confirmSaveAll}
          </button>
          <button type="button" className="button button-glass"
            disabled={saving !== null}
            onClick={() => void doSearch()}>
            {t.confirmSkip}
          </button>
        </div>
      </section>
    </div>}
  </div>;
}
