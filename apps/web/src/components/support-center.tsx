"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { TicketChat, TICKET_STATUS_LABEL, ticketOpen } from "@/components/ticket-chat";

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
export function SupportCenter({ tickets: initial, admin = false }: { tickets: TicketRow[]; admin?: boolean }) {
  const [tickets, setTickets] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = tickets.find((t) => t.id === openId) ?? null;

  function patchStatus(id: string, status: string) {
    setTickets((list) => list.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  return <>
    <ul className="ticket-list">
      {tickets.length === 0 && <li className="dash-empty">Nenhum chamado ainda.</li>}
      {tickets.map((t) => (
        <li key={t.id}>
          <button type="button" className={`ticket-open ${openId === t.id ? "active" : ""}`} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
            <div>
              <strong>{t.assunto}</strong>
              <small>
                {admin && t.cliente ? `${t.cliente} · ` : ""}
                {new Date(t.created_at).toLocaleDateString("pt-BR")} · prioridade {t.prioridade}
              </small>
            </div>
            <span className="ticket-open-right">
              <span className={`ticket-status ticket-${t.status}`}>{TICKET_STATUS_LABEL[t.status] ?? t.status}</span>
              <MessageCircle size={16} />
            </span>
          </button>
          {openId === t.id && open && (
            <div className="ticket-chat-wrap">
              <TicketChat ticketId={t.id} status={open.status} onStatus={(s) => patchStatus(t.id, s)} />
            </div>
          )}
        </li>
      ))}
    </ul>
  </>;
}

export { TICKET_STATUS_LABEL, ticketOpen };
