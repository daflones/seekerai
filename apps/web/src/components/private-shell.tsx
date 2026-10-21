"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDollarSign, Compass, Headset, Images, LayoutDashboard, LogOut, MessageCircle, PanelsTopLeft, ShieldCheck, Users } from "lucide-react";
import { Brand } from "./brand";

async function doLogout() {
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (response.ok) window.location.replace("/login");
  } catch { /* mantém na página */ }
}

const NAV = [
  { href: "/app", label: "Painel", icon: LayoutDashboard, exact: true },
  { href: "/app/buscar", label: "Buscar clientes", icon: Compass },
  { href: "/app/leads", label: "Meus leads", icon: Users },
  { href: "/app/portfolio", label: "Portfólio", icon: Images },
  { href: "/app/planos", label: "Planos e créditos", icon: CircleDollarSign },
  { href: "/app/suporte", label: "Suporte", icon: Headset },
];

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/financeiro", label: "Financeiro", icon: CircleDollarSign },
  { href: "/admin/chamados", label: "Chamados", icon: MessageCircle },
  { href: "/admin/planos", label: "Cards de plano", icon: PanelsTopLeft },
  { href: "/admin/integracoes", label: "Integrações", icon: ShieldCheck },
];

export function PrivateShell({
  admin = false,
  name = "",
  email = "",
  credits,
  adminArea = false,
  children,
}: {
  admin?: boolean;
  name?: string;
  email?: string;
  credits?: number | null;
  adminArea?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = adminArea ? ADMIN_NAV : NAV;
  const initials = (name || email || "S").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return <div className="shell">
    <aside className="shell-sidebar">
      <Link href="/" className="shell-brand"><Brand /></Link>
      {adminArea && <span className="shell-area-tag">Administração</span>}
      <nav className="shell-nav" aria-label="Plataforma">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon size={18} />{label}
          </Link>;
        })}
      </nav>
      <div className="shell-side-foot">
        {credits !== undefined && !adminArea && (
          <Link href="/app/planos" className="shell-credits" aria-label="Seus créditos">
            <span className="shell-credits-label">Créditos</span>
            <strong>{credits ?? "—"}</strong>
          </Link>
        )}
        <div className="shell-user">
          <span className="shell-avatar" aria-hidden>{initials}</span>
          <span className="shell-user-meta">
            <strong>{name || "Minha conta"}</strong>
            <small>{email}</small>
          </span>
        </div>
        {admin && !adminArea && <Link href="/admin" className="shell-admin-link"><ShieldCheck size={14} />Painel admin</Link>}
        {adminArea && <Link href="/app" className="shell-admin-link"><Compass size={14} />Voltar ao app</Link>}
        <button type="button" onClick={() => void doLogout()} className="shell-logout"><LogOut size={14} />Sair da conta</button>
      </div>
    </aside>
    <div className="shell-main">
      <nav className="shell-topnav" aria-label="Navegação móvel">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={15} />{label}</Link>;
        })}
      </nav>
      <main id="conteudo" className="shell-content">{children}</main>
    </div>
  </div>;
}
