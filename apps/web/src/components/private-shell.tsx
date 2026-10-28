"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDollarSign, Compass, Globe, Headset, Images, LayoutDashboard, LogOut, MessageCircle, PanelsTopLeft, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Brand } from "./brand";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import type { Locale, Theme } from "@/lib/i18n/shared";
import type { Messages } from "@/lib/i18n/messages";

async function doLogout() {
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (response.ok) window.location.replace("/login");
  } catch { /* mantém na página */ }
}

const DEFAULT_T: Messages["shell"] = {
  dashboard: "Painel", seek: "Buscar clientes", leads: "Meus leads",
  portfolio: "Portfólio", studio: "Estúdio", plans: "Planos e créditos", support: "Suporte",
  credits: "Créditos", myAccount: "Minha conta", adminPanel: "Painel admin",
  backToApp: "Voltar ao app", logout: "Sair da conta", adminTag: "Administração",
  navAria: "Plataforma", mobileAria: "Navegação móvel",
};

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/admin/financeiro", label: "Financeiro", icon: CircleDollarSign },
  { href: "/admin/chamados", label: "Chamados", icon: MessageCircle },
  { href: "/admin/dominios", label: "Domínios", icon: Globe },
  { href: "/admin/planos", label: "Cards de plano", icon: PanelsTopLeft },
  { href: "/admin/integracoes", label: "Integrações", icon: ShieldCheck },
];

export function PrivateShell({
  admin = false,
  name = "",
  email = "",
  credits,
  adminArea = false,
  t = DEFAULT_T,
  locale,
  theme = "dark",
  children,
}: {
  admin?: boolean;
  name?: string;
  email?: string;
  credits?: number | null;
  adminArea?: boolean;
  t?: Messages["shell"];
  locale?: Locale;
  theme?: Theme;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = [
    { href: "/app", label: t.dashboard, icon: LayoutDashboard, exact: true },
    { href: "/app/buscar", label: t.seek, icon: Compass },
    { href: "/app/leads", label: t.leads, icon: Users },
    { href: "/app/criar", label: t.studio, icon: Sparkles },
    { href: "/app/portfolio", label: t.portfolio, icon: Images },
    { href: "/app/planos", label: t.plans, icon: CircleDollarSign },
    { href: "/app/suporte", label: t.support, icon: Headset },
  ];
  const items = adminArea ? ADMIN_NAV : nav;
  const initials = (name || email || "S").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return <div className="shell">
    <aside className="shell-sidebar">
      <Link href="/" className="shell-brand"><Brand /></Link>
      {adminArea && <span className="shell-area-tag">{t.adminTag}</span>}
      <nav className="shell-nav" aria-label={t.navAria}>
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon size={18} />{label}
          </Link>;
        })}
      </nav>
      <div className="shell-side-foot">
        {credits !== undefined && !adminArea && (
          <Link href="/app/planos" className="shell-credits" aria-label={t.credits}>
            <span className="shell-credits-label">{t.credits}</span>
            <strong>{credits ?? "—"}</strong>
          </Link>
        )}
        <div className="shell-user">
          <span className="shell-avatar" aria-hidden>{initials}</span>
          <span className="shell-user-meta">
            <strong>{name || t.myAccount}</strong>
            <small>{email}</small>
          </span>
        </div>
        {admin && !adminArea && <Link href="/admin" className="shell-admin-link"><ShieldCheck size={14} />{t.adminPanel}</Link>}
        {adminArea && <Link href="/app" className="shell-admin-link"><Compass size={14} />{t.backToApp}</Link>}
        <div className="shell-controls">
          {locale && <LocaleSwitcher current={locale} />}
          <ThemeToggle theme={theme} />
        </div>
        <button type="button" onClick={() => void doLogout()} className="shell-logout"><LogOut size={14} />{t.logout}</button>
      </div>
    </aside>
    <div className="shell-main">
      <nav className="shell-topnav" aria-label={t.mobileAria}>
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} className={active ? "active" : ""}><Icon size={15} />{label}</Link>;
        })}
      </nav>
      <main id="conteudo" className="shell-content">{children}</main>
    </div>
  </div>;
}
