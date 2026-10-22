"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { TicketChat, TICKET_STATUS_LABEL, ticketOpen } from "@/components/ticket-chat";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { dateTag, type Lang } from "@/lib/i18n/shared";

type SupT = Messages["support"];

export interface TicketRow {
  id: string;
  assunto: string;
  categoria: string;
  prioridade: string;
  status: string;
  created_at: string;
  cliente?: string;
}

// Lista de chamados + conversa em tempo real ao clicar.
export function SupportCenter({ tickets: initial, admin = false, t, lang = "pt" }: { tickets: TicketRow[]; admin?: boolean; t?: SupT; lang?: Lang }) {
  const tt = t ?? getMessages("pt").support;
  const tag = dateTag(lang);
  const [tickets, setTickets] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const open = tickets.find((t) => t.id === openId) ?? null;
  const PAGE = 10;
  const pages = Math.max(1, Math.ceil(tickets.length / PAGE));
  const pageItems = tickets.slice((page - 1) * PAGE, page * PAGE);
  const statusLabel = (s: string) => (tt.status as Record<string, string>)[s] ?? TICKET_STATUS_LABEL[s] ?? s;
  const prioLabel = (p: string) => (tt.priorities as Record<string, string>)[p] ?? p;

  function patchStatus(id: string, status: string) {
    setTickets((list) => list.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  return <>
    <ul className="ticket-list">
      {tickets.length === 0 && <li className="dash-empty">{tt.empty}</li>}
      {pageItems.map((t) => (
        <li key={t.id}>
          <button type="button" className={`ticket-open ${openId === t.id ? "active" : ""}`} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
            <div>
              <strong>{t.assunto}</strong>
              <small>
                {admin && t.cliente ? `${t.cliente} · ` : ""}
                {new Date(t.created_at).toLocaleDateString(tag)} · {tt.priorityOf} {prioLabel(t.prioridade).toLowerCase()}
              </small>
            </div>
            <span className="ticket-open-right">
              <span className={`ticket-status ticket-${t.status}`}>{statusLabel(t.status)}</span>
              <MessageCircle size={16} />
            </span>
          </button>
          {openId === t.id && open && (
            <div className="ticket-chat-wrap">
              <TicketChat ticketId={t.id} status={open.status} onStatus={(s) => patchStatus(t.id, s)} t={tt} lang={lang} />
            </div>
          )}
        </li>
      ))}
    </ul>

    {pages > 1 && <nav className="lead-pager" aria-label={tt.pagerAria}>
      <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /> {tt.prev}</button>
      <span>{page} / {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{tt.next} <ChevronRight size={14} /></button>
    </nav>}
  </>;
}

export { TICKET_STATUS_LABEL, ticketOpen };
