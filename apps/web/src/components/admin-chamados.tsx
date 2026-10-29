"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Hourglass, Loader2, MessageCircle, XCircle } from "lucide-react";
import { TicketChat, TICKET_STATUS_LABEL } from "@/components/ticket-chat";
import type { TicketRow } from "@/components/support-center";

const FILTROS = [
  ["todos", "Todos"],
  ["aberto", "Abertos"],
  ["em_andamento", "Em andamento"],
  ["pendente", "Pendentes"],
  ["resolvido", "Resolvidos"],
  ["cancelado", "Cancelados"],
  ["expirado", "Expirados"],
];

const ACOES: [string, typeof CheckCircle2][] = [
  ["em_andamento", Hourglass],
  ["pendente", Hourglass],
  ["resolvido", CheckCircle2],
  ["cancelado", XCircle],
];

export function AdminChamados({ tickets: initial }: { tickets: TicketRow[] }) {
  const [tickets, setTickets] = useState(initial);
  const [filtro, setFiltro] = useState("todos");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const list = useMemo(
    () => (filtro === "todos" ? tickets : tickets.filter((t) => t.status === filtro)),
    [tickets, filtro],
  );
  const PAGE = 10;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const pageItems = list.slice((page - 1) * PAGE, page * PAGE);
  const counts = useMemo(() => tickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {}), [tickets]);

  async function setStatus(id: string, status: string) {
    if (busyStatus) return;
    setBusyStatus(`${id}:${status}`);
    setError("");
    const res = await fetch(`/api/admin/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusyStatus(null);
    if (!res?.ok) { setError(data?.error ?? "Não foi possível atualizar."); return; }
    setTickets((l) => l.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  return <>
    <div className="chamados-filters">
      {FILTROS.map(([key, label]) => (
        <button key={key} type="button" className={filtro === key ? "active" : ""} onClick={() => { setFiltro(key); setPage(1); }}>
          {label}{key !== "todos" && counts[key] ? ` (${counts[key]})` : ""}
        </button>
      ))}
    </div>

    {error && <p className="form-error">{error}</p>}

    <ul className="ticket-list">
      {list.length === 0 && <li className="dash-empty">Nenhum chamado nesse filtro.</li>}
      {pageItems.map((t) => (
        <li key={t.id}>
          <button type="button" className={`ticket-open ${openId === t.id ? "active" : ""}`} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
            <div>
              <strong>{t.assunto}</strong>
              <small>{t.cliente} · {new Date(t.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {t.categoria} · prioridade {t.prioridade}</small>
            </div>
            <span className="ticket-open-right">
              {t.atendente === "ia" && <span className="ticket-ia" title="Atendido pela IA de suporte">IA</span>}
              <span className={`ticket-status ticket-${t.status}`}>{TICKET_STATUS_LABEL[t.status] ?? t.status}</span>
              <MessageCircle size={16} />
            </span>
          </button>
          {openId === t.id && (
            <div className="ticket-chat-wrap">
              <div className="chamados-actions">
                <span>Status:</span>
                {ACOES.map(([s, Icon]) => (
                  <button key={s} type="button"
                    className={`status-btn status-${s} ${t.status === s ? "active" : ""}`}
                    disabled={busyStatus !== null || t.status === s}
                    onClick={() => void setStatus(t.id, s)}>
                    {busyStatus === `${t.id}:${s}` ? <Loader2 size={13} className="spin" /> : <Icon size={13} />}
                    {TICKET_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <TicketChat ticketId={t.id} status={t.status} onStatus={(s) => setTickets((l) => l.map((x) => (x.id === t.id ? { ...x, status: s } : x)))} />
            </div>
          )}
        </li>
      ))}
    </ul>

    {pages > 1 && <nav className="lead-pager" aria-label="Páginas de chamados">
      <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /> Anterior</button>
      <span>{page} / {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Próxima <ChevronRight size={14} /></button>
    </nav>}
  </>;
}
