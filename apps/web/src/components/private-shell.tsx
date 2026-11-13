"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ChevronDown, CircleDollarSign, ClipboardList, Compass, Globe, Headset, Images, LayoutDashboard, LogOut, MessageCircle, PanelsTopLeft, Radar, Shapes, ShieldCheck, Sparkles, UserRound, Users, Zap } from "lucide-react";
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
  creations: "Minhas criações", domains: "Domínios",
  credits: "Créditos", myAccount: "Minha conta", adminPanel: "Painel admin",
  backToApp: "Voltar ao app", logout: "Sair da conta", adminTag: "Administração",
  navAria: "Plataforma", mobileAria: "Navegação móvel",
};

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/admin/onboarding", label: "Onboarding", icon: ClipboardList },
  { href: "/admin/financeiro", label: "Financeiro", icon: CircleDollarSign },
  { href: "/admin/chamados", label: "Chamados", icon: MessageCircle },
  { href: "/admin/jobs", label: "Jobs", icon: Activity },
  { href: "/admin/criacoes", label: "Criações", icon: Shapes },
  { href: "/admin/dominios", label: "Domínios", icon: Globe },
  { href: "/admin/planos", label: "Cards de plano", icon: PanelsTopLeft },
  { href: "/admin/busca", label: "Busca de leads", icon: Radar },
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
  // O editor visual de sites ocupa a tela inteira — sem header nem nav.
  if (pathname.endsWith("/editar")) return <>{children}</>;
  const nav = [
    { href: "/app", label: t.dashboard, icon: LayoutDashboard, exact: true },
    { href: "/app/buscar", label: t.seek, icon: Compass },
    { href: "/app/leads", label: t.leads, icon: Users },
    { href: "/app/criar", label: t.studio, icon: Sparkles },
    { href: "/app/criacoes", label: t.creations, icon: Shapes },
    { href: "/app/portfolio", label: t.portfolio, icon: Images },
    { href: "/app/dominios", label: t.domains, icon: Globe },
    { href: "/app/planos", label: t.plans, icon: CircleDollarSign },
    { href: "/app/suporte", label: t.support, icon: Headset },
  ];
  const items = adminArea ? ADMIN_NAV : nav;
  const initials = (name || email || "S").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return <div className={`shell shell-workspace${adminArea ? " shell-area-admin" : ""}`}>
    <header className="workspace-header">
      <div className="workspace-toolbar">
        <span className="workspace-brand"><Brand href={adminArea ? "/admin" : "/app"} /></span>
        <div className="workspace-tools">
          {adminArea && <span className="workspace-area-tag">{t.adminTag}</span>}
          {credits !== undefined && !adminArea && <Link href="/app/planos#creditos" className="workspace-balance">
            <Zap size={14} /><strong>{credits ?? "—"}</strong><span>{t.credits}</span>
          </Link>}
          <ThemeToggle theme={theme} />
          <details className="workspace-account" key={pathname}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}>
            <summary aria-label={t.myAccount}>
              <span className="shell-avatar" aria-hidden>{initials}</span>
              <span className="workspace-account-name"><strong>{name || t.myAccount}</strong><small>{t.myAccount}</small></span>
              <ChevronDown size={13} />
            </summary>
            <div className="workspace-account-popover">
              <div className="shell-user-meta"><strong>{name || t.myAccount}</strong><small>{email}</small></div>
              {locale && <LocaleSwitcher current={locale} />}
              {admin && !adminArea && <Link href="/admin" className="shell-admin-link"><ShieldCheck size={15} />{t.adminPanel}</Link>}
              {adminArea && <Link href="/app" className="shell-admin-link"><Compass size={15} />{t.backToApp}</Link>}
              {!adminArea && <Link href="/app/conta" className="shell-admin-link"><UserRound size={15} />{t.myAccount}</Link>}
              {!adminArea && <Link href="/app/suporte" className="shell-admin-link"><Headset size={15} />{t.support}</Link>}
              <button type="button" onClick={() => void doLogout()} className="shell-logout"><LogOut size={15} />{t.logout}</button>
            </div>
          </details>
        </div>
      </div>
      <nav className="workspace-nav" aria-label={t.navAria}>
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon size={16} /><span>{label}</span>
          </Link>;
        })}
      </nav>
    </header>
    <div className="shell-main">
      <main id="conteudo" className="shell-content" key={pathname}>{children}</main>
    </div>
  </div>;
}
