"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppWindow, ChevronDown, Code2, ExternalLink, Globe, Image as ImageIcon, Loader2, Pencil, Smartphone, Type } from "lucide-react";
import type { AdminCreation } from "@/app/api/admin/creations/route";

const KIND_META: Record<string, { label: string; icon: typeof Globe }> = {
  site: { label: "Site de lead", icon: Globe },
  app_web: { label: "App web", icon: AppWindow },
  app_mobile: { label: "App mobile", icon: Smartphone },
  image: { label: "Imagem", icon: ImageIcon },
  text: { label: "Texto", icon: Type },
};

const FILTERS = [
  { id: "all", label: "Tudo" },
  { id: "site", label: "Sites" },
  { id: "app", label: "Apps" },
  { id: "image", label: "Imagens" },
  { id: "text", label: "Textos" },
];

interface DetailPayload {
  prompt?: string;
  html?: string;
  modelo?: string;
  erro?: string;
  conteudo?: string;
  config?: unknown;
  publicado?: boolean;
}

export function AdminCreations() {
  const [items, setItems] = useState<AdminCreation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, DetailPayload | "loading">>({});

  useEffect(() => {
    void fetch("/api/admin/creations", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((i) => filter === "all" || i.kind === filter)
      .filter((i) => !needle || i.title.toLowerCase().includes(needle)
        || i.owner.toLowerCase().includes(needle)
        || (i.leadName ?? "").toLowerCase().includes(needle)
        || (i.model ?? "").toLowerCase().includes(needle));
  }, [items, filter, q]);

  async function loadDetail(key: string) {
    if (detail[key]) return;
    setDetail((d) => ({ ...d, [key]: "loading" }));
    const res = await fetch(`/api/admin/creations?detail=${encodeURIComponent(key)}`, { cache: "no-store" });
    const data = res.ok ? await res.json() : {};
    setDetail((d) => ({ ...d, [key]: data.detail ?? {} }));
  }

  async function toggle(item: AdminCreation) {
    const key = `${item.kind}:${item.id}`;
    if (open === key) { setOpen(null); return; }
    setOpen(key);
    await loadDetail(key);
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const statusClass = (s: AdminCreation["status"]) =>
    s === "done" ? "resolvido" : s === "error" ? "cancelado" : "em_andamento";

  return <>
    <div className="chamados-filters">
      {FILTERS.map((f) => (
        <button key={f.id} type="button" className={filter === f.id ? "active" : ""}
          onClick={() => setFilter(f.id)}>{f.label}</button>
      ))}
      <input type="search" className="adm-create-search" placeholder="Buscar título, criador, lead, modelo…"
        value={q} onChange={(e) => setQ(e.target.value)} />
    </div>

    {loading ? <p className="private-intro"><Loader2 size={15} className="spin" /> Carregando criações…</p>
      : filtered.length === 0 ? <p className="dash-empty">Nenhuma criação nesse filtro.</p>
      : <ul className="adm-jobs">
        {filtered.map((item) => {
          const meta = KIND_META[item.sub] ?? KIND_META[item.kind];
          const key = `${item.kind}:${item.id}`;
          const isOpen = open === key;
          const d = detail[key];
          const cfgKey = item.siteSlug ? `site-config:${item.siteSlug}` : null;
          const cfg = cfgKey ? detail[cfgKey] : null;
          const Icon = meta.icon;
          return <li key={key} className={`adm-job adm-job-${item.status}`}>
            <button type="button" className="adm-job-head" onClick={() => void toggle(item)} aria-expanded={isOpen}>
              <span className="adm-job-ico">{item.status === "running" ? <Loader2 size={15} className="spin" /> : <Icon size={15} />}</span>
              <span className="adm-job-main">
                <strong>{item.title || "(sem título)"}</strong>
                <small>{meta.label} · {item.owner}{item.leadName && item.kind !== "site" ? ` · lead ${item.leadName}` : ""}{item.model ? ` · ${item.model}` : ""}</small>
              </span>
              <span className="adm-job-side">
                <span className={`ticket-status ticket-${statusClass(item.status)}`}>
                  {item.status === "running" ? "Gerando" : item.status === "error" ? "Erro" : "Concluída"}
                </span>
                <time className="adm-creation-date">{fmt(item.createdAt)}</time>
                <ChevronDown size={14} className={isOpen ? "adm-job-open" : ""} />
              </span>
            </button>

            {isOpen && <div className="adm-job-detail">
              <div className="adm-creation-actions">
                {item.siteSlug && <>
                  <Link href={`/site/${item.siteSlug}`} target="_blank" className="button button-glass button-small">
                    <ExternalLink size={13} /> Abrir site
                  </Link>
                  <Link href={`/app/sites/${item.siteSlug}/editar`} className="button button-glass button-small">
                    <Pencil size={13} /> Editar site
                  </Link>
                  {item.kind === "site" && !cfg && cfg !== "loading" && (
                    <button type="button" className="button button-glass button-small"
                      onClick={() => void loadDetail(`site-config:${item.siteSlug}`)}>
                      <Code2 size={13} /> Config do site
                    </button>
                  )}
                </>}
                {!item.siteSlug && item.status === "done" && (item.kind === "site" || item.kind === "app") && (
                  <small className="adm-job-resumo">Não publicado em /site ainda.</small>
                )}
              </div>

              {item.erro && <p className="auth-error">Erro da geração: {item.erro}</p>}

              {d === "loading" && <p className="adm-job-resumo"><Loader2 size={13} className="spin" /> Carregando…</p>}
              {d && d !== "loading" && <>
                {d.prompt && <>
                  <small className="adm-creation-label">Prompt usado</small>
                  <p className="adm-job-resumo">{d.prompt}</p>
                </>}
                {d.modelo && <p className="adm-job-resumo"><strong>Modelo:</strong> {d.modelo}</p>}
                {d.conteudo && <>
                  <small className="adm-creation-label">Conteúdo gerado</small>
                  <pre className="adm-creation-code">{d.conteudo.slice(0, 4000)}{d.conteudo.length > 4000 ? "\n…" : ""}</pre>
                </>}
                {d.html && <>
                  <small className="adm-creation-label">Código gerado ({Math.round(d.html.length / 1024)} KB)</small>
                  <details className="adm-creation-preview">
                    <summary>Pré-visualizar renderizado</summary>
                    <iframe title="Prévia do app" sandbox="allow-scripts" className="adm-creation-frame" srcDoc={d.html} />
                  </details>
                  <pre className="adm-creation-code">{d.html.slice(0, 12000)}{d.html.length > 12000 ? "\n…(código truncado)" : ""}</pre>
                </>}
              </>}

              {cfg === "loading" && <p className="adm-job-resumo"><Loader2 size={13} className="spin" /> Carregando config…</p>}
              {cfg && cfg !== "loading" && <>
                <small className="adm-creation-label">Config do site (JSON)</small>
                <pre className="adm-creation-code">{JSON.stringify(cfg.config, null, 2).slice(0, 12000)}</pre>
              </>}
            </div>}
          </li>;
        })}
      </ul>}
  </>;
}
