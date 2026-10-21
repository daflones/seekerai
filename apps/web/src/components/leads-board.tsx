"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Phone, Star, Globe } from "lucide-react";
import { LEAD_STATUS, type LeadRow } from "@/lib/app-client";

export function LeadsBoard({ initialLeads, serviceNames }: {
  initialLeads: LeadRow[];
  serviceNames: Record<string, string>;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [filter, setFilter] = useState<string>("todos");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visible = useMemo(
    () => filter === "todos" ? leads : leads.filter((l) => l.status === filter),
    [leads, filter],
  );

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

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: leads.length };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  return <>
    <div className="lead-filters" role="tablist" aria-label="Filtrar por status">
      <button className={filter === "todos" ? "active" : ""} onClick={() => setFilter("todos")}>
        Todos ({counts.todos ?? 0})</button>
      {LEAD_STATUS.map(([value, label]) => counts[value] ?
        <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
          {label} ({counts[value]})</button> : null)}
    </div>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {visible.length === 0 && <p className="seek-empty">Nenhum lead nesse status ainda.</p>}
    <div className="lead-list">
      {visible.map((lead) => <article key={lead.id} className="lead-row">
        <div className="lead-row-main">
          <h3><Link href={`/app/leads/${lead.id}`}>{lead.nome}</Link></h3>
          <p className="lead-row-meta">
            {lead.categoria && <span>{lead.categoria}</span>}
            {[lead.cidade, lead.uf].filter(Boolean).join("/") && <span>{[lead.cidade, lead.uf].filter(Boolean).join("/")}</span>}
            {lead.avaliacao !== null && <span className="seek-score"><Star size={11} />{lead.avaliacao.toFixed(1)}</span>}
            {lead.telefone && <span><Phone size={11} />{lead.telefone}</span>}
          </p>
          <p className="lead-row-tags">
            <span className="seek-badge">{serviceNames[lead.service_slug] ?? lead.service_slug}</span>
            {!lead.site && <span className="seek-badge seek-badge-gap">Sem site</span>}
            {lead.site && <span className="seek-badge seek-badge-ok"><Globe size={10} />Site</span>}
            {lead.whatsapp === "sim" && <span className="seek-badge seek-badge-ok">WhatsApp</span>}
            {lead.instagram && <span className="seek-badge">{lead.instagram}</span>}
          </p>
        </div>
        <div className="lead-row-side">
          <select
            aria-label={`Status de ${lead.nome}`}
            value={lead.status}
            disabled={busy === lead.id}
            onChange={(e) => void setStatus(lead.id, e.target.value as LeadRow["status"])}
            className={`lead-status lead-status-${lead.status}`}
          >
            {LEAD_STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Link className="text-link" href={`/app/leads/${lead.id}`}>Abrir<ArrowUpRight size={13} /></Link>
        </div>
      </article>)}
    </div>
  </>;
}
