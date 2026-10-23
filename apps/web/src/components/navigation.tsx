"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "./brand";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import type { Locale, Theme } from "@/lib/i18n/shared";
import { getMessages, type Messages } from "@/lib/i18n/messages";

export function Navigation({ t = getMessages("pt").nav, locale, theme }: { t?: Messages["nav"]; locale: Locale; theme: Theme }) {
  const [open, setOpen] = useState(false);
  const links: [string, string][] = [[t.how, "#como-funciona"], [t.features, "#recursos"], [t.portfolio, "#portfolio"], [t.plans, "#planos"]];
  return (
    <header className="nav-shell">
      <nav className="floating-nav" aria-label={t.main}>
        <Brand />
        <div className="desktop-links">{links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</div>
        <div className="nav-actions">
          <LocaleSwitcher current={locale} />
          <ThemeToggle theme={theme} />
          <Link href="/login" className="login-link">{t.login}</Link>
          <Link href="/cadastro" className="button button-small">{t.start} <ArrowUpRight size={14} /></Link>
          <button className="mobile-menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? t.closeMenu : t.openMenu}>{open ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
        {open && <div id="mobile-menu" className="mobile-menu">{links.map(([label, href]) => <a href={href} key={href} onClick={() => setOpen(false)}>{label}</a>)}<Link href="/login">{t.enter}</Link></div>}
      </nav>
    </header>
  );
}
