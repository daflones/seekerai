"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Bell, CheckCheck, Globe, LifeBuoy, Zap } from "lucide-react";

export interface DashNotif {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string | null;
  lida: boolean;
}

// Avisos do app na dashboard — chamado respondido, chat do admin,
// domínio/plano vencendo. Clicar marca como lida e leva ao destino.
const ICONS: Record<string, typeof Bell> = {
  chamado_respondido: LifeBuoy,
  chat_admin: LifeBuoy,
  dominio: Globe,
  dominio_expirado: Globe,
  plano_expirado: Zap,
};
const LINKS: Record<string, string> = {
  chamado_respondido: "/app/suporte",
  chat_admin: "/app/suporte",
  dominio: "/app/dominios",
  dominio_expirado: "/app/dominios",
  plano_expirado: "/app/planos",
};

export function DashNotifications({ items, title, markAll }: {
  items: DashNotif[];
  title: string;
  markAll: string;
}) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const unread = list.filter((n) => !n.lida);
  if (!list.length) return null;

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    setList((l) => l.map((n) => (ids.includes(n.id) ? { ...n, lida: true } : n)));
    await fetch("/api/domains/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }

  return (
    <section className="dash-notifs" aria-label={title}>
      <div className="dash-notifs-head">
        <h2><Bell size={14} /> {title}{unread.length > 0 && <em className="dash-notifs-count">{unread.length}</em>}</h2>
        {unread.length > 0 && (
          <button type="button" className="text-link" onClick={() => void markRead(unread.map((n) => n.id))}>
            <CheckCheck size={13} /> {markAll}
          </button>
        )}
      </div>
      <ul>
        {list.map((n) => {
          const Icon = ICONS[n.tipo] ?? Bell;
          const href = LINKS[n.tipo] ?? "/app";
          return (
            <li key={n.id} className={n.lida ? "" : "is-unread"}>
              <Link href={href} onClick={() => { if (!n.lida) void markRead([n.id]); router.refresh(); }}>
                <Icon size={15} className="dash-notif-icon" />
                <span className="dash-notif-body">
                  <strong>{n.titulo}</strong>
                  {n.corpo && <small>{n.corpo}</small>}
                </span>
                <ArrowUpRight size={14} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
