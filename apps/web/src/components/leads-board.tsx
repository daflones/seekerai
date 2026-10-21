"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Building2, CheckCircle2, ChevronLeft, ChevronRight,
  Globe, Image as ImageIcon, Loader2, MapPin, MessageSquareText,
  Phone, Sparkles, Star, Target, FileCode2,
} from "lucide-react";
import { callAction, LEAD_STATUS, placeImageSrc, type LeadRow } from "@/lib/app-client";

const PAGE_SIZE = 9;

type ActionKind = "sales_reply" | "deep_strategy" | "generate_site" | "generate_image";

const QUICK: { kind: ActionKind; label: string; icon: typeof Sparkles; needsImageAction?: boolean }[] = [
  { kind: "sales_reply", label: "Mensagem", icon: MessageSquareText },
  { kind: "deep_strategy", label: "Estratégia", icon: Target },
  { kind: "generate_site", label: "Site", icon: FileCode2 },
  { kind: "generate_image", label: "Imagem", icon: ImageIcon, needsImageAction: true },
];

function promptFor(kind: ActionKind, lead: LeadRow, serviceName: string): string {
  const gap = lead.site ? "" : " O estabelecimento NÃO tem site — use isso como gancho principal.";
  switch (kind) {
    case "sales_reply":
      return `Escreva uma mensagem curta de primeira abordagem via WhatsApp oferecendo ${serviceName} para este estabelecimento.` +
        `${gap} Tom humano, sem exageros, máximo 3 parágrafos curtos, terminando com uma pergunta simples.`;
    case "deep_strategy":
      return `Monte a estratégia de venda de ${serviceName} para este estabelecimento: diagnóstico, gaps observáveis,` +
        ` ângulo de abordagem, objeções prováveis e o próximo passo concreto.${gap}`;
    case "generate_site":
      return `Crie o site institucional completo deste estabelecimento, pronto para publicar.` +
        ` Nome, categoria, endereço, telefone e avaliação estão no contexto — use-os de verdade.`;
    default:
      return `Fotografia profissional e realista de ${lead.nome} — ${lead.categoria ?? "negócio local"} em ${lead.cidade ?? "cidade brasileira"}.` +
        ` Estilo editorial premium, luz natural, sem texto nem marcas d'água.`;
  }
}

// Sugestão de abordagem derivada dos sinais do estabelecimento.
function suggestion(lead: LeadRow): string {
  if (!lead.site && lead.whatsapp === "sim") return "Sem site, mas com WhatsApp ativo — o cliente responde rápido e sente falta de presença digital.";
  if (!lead.site) return "Sem site — primeiro contato deve mostrar o quanto eles perdem sem presença online.";
  if (lead.whatsapp !== "sim") return "WhatsApp não confirmado — comece pelo telefone ou Maps antes de propor automação.";
  if ((lead.avaliacao ?? 0) >= 4.5) return "Avaliação alta — use a reputação como argumento para ampliar a presença deles.";
  return "Perfil com espaço pra crescer — mostre um ganho concreto e mensurável na primeira conversa.";
}

export function LeadsBoard({ initialLeads, serviceNames, serviceActions, costs }: {
  initialLeads: LeadRow[];
  serviceNames: Record<string, string>;
  serviceActions: Record<string, string[]>;
  costs: Record<string, number | null>;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [filter, setFilter] = useState<string>("todos");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notices, setNotices] = useState<Record<string, string>>({});

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
    if (!res.ok) { setError("Não foi possível atualizar o status."); return; }
    setLeads((list) => list.map((l) => l.id === id ? { ...l, status } : l));
  }

  function notice(id: string, msg: string) {
    setNotices((n) => ({ ...n, [id]: msg }));
  }

  async function generate(lead: LeadRow, kind: ActionKind) {
    const key = `${lead.id}:${kind}`;
    if (busy) return;
    setBusy(key);
    setError("");
    notice(lead.id, "");
    const serviceName = serviceNames[lead.service_slug] ?? lead.service_slug;
    const res = await callAction<{ conteudo?: string; imagens?: string[]; modelo?: string; creditosCobrados?: number }>(
      "ai-generate",
      {
        action: kind,
        serviceSlug: lead.service_slug,
        businessRef: lead.id,
        requestRef: crypto.randomUUID(),
        prompt: promptFor(kind, lead, serviceName),
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
    const label = QUICK.find((q) => q.kind === kind)?.label ?? "Saída";
    notice(lead.id, `${label} gerada`);
  }

  return <>
    <div className="lead-filters" role="tablist" aria-label="Filtrar por status">
      <button className={filter === "todos" ? "active" : ""} onClick={() => pick("todos")}>
        Todos ({counts.todos ?? 0})</button>
      {LEAD_STATUS.map(([value, label]) => counts[value] ?
        <button key={value} className={filter === value ? "active" : ""} onClick={() => pick(value)}>
          {label} ({counts[value]})</button> : null)}
    </div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {visible.length === 0 && <p className="seek-empty">Nenhum lead nesse status ainda.</p>}

    <div className="lead-grid">
      {pageItems.map((lead) => {
        const actions = serviceActions[lead.service_slug] ?? [];
        const serviceName = serviceNames[lead.service_slug] ?? lead.service_slug;
        return <article key={lead.id} className="lead-card">
          <div className="lead-card-media">
            {placeImageSrc(lead.imagem)
              // eslint-disable-next-line @next/next/no-img-element -- URL externa do provedor de lugares
              ? <img src={placeImageSrc(lead.imagem)!} alt={`Foto de ${lead.nome}`} loading="lazy" />
              : <span className="lead-card-fallback"><Building2 size={26} />{lead.nome.slice(0, 1)}</span>}
            <select
              aria-label={`Status de ${lead.nome}`}
              value={lead.status}
              disabled={busy === lead.id}
              onChange={(e) => void setStatus(lead.id, e.target.value as LeadRow["status"])}
              className={`lead-status lead-status-${lead.status}`}
            >
              {LEAD_STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
              {!lead.site && <span className="seek-badge seek-badge-gap">Sem site</span>}
              {lead.site && <span className="seek-badge seek-badge-ok"><Globe size={10} />Site</span>}
              {lead.whatsapp === "sim" && <span className="seek-badge seek-badge-ok">WhatsApp</span>}
              {lead.instagram && <span className="seek-badge">{lead.instagram}</span>}
            </p>
            <p className="lead-tip"><Sparkles size={12} />{suggestion(lead)}</p>

            <div className="lead-actions">
              {QUICK.filter((q) => actions.includes(q.kind)).map(({ kind, label, icon: Icon }) => {
                const key = `${lead.id}:${kind}`;
                return <button key={kind} type="button" className="lead-action"
                  disabled={busy !== null || costs[kind] === null}
                  title={costs[kind] === null ? `${label} indisponível` : label}
                  onClick={() => void generate(lead, kind)}>
                  {busy === key ? <Loader2 size={13} className="spin" /> : <Icon size={13} />}
                  {label}
                </button>;
              })}
              <Link className="lead-open" href={`/app/leads/${lead.id}`}>Abrir <ArrowUpRight size={13} /></Link>
            </div>
            {notices[lead.id] && <p className="lead-notice"><CheckCircle2 size={12} />{notices[lead.id]} — <Link href={`/app/leads/${lead.id}`}>ver no lead</Link></p>}
          </div>
        </article>;
      })}
    </div>

    {pages > 1 && (
      <nav className="lead-pager" aria-label="Páginas de leads">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> Anterior</button>
        <span>{page + 1} / {pages}</span>
        <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima <ChevronRight size={14} /></button>
      </nav>
    )}
  </>;
}
