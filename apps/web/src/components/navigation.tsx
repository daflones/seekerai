"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "./brand";

export function Navigation() {
  const [open, setOpen] = useState(false);
  return (
    <header className="nav-shell">
      <nav className="floating-nav" aria-label="Navegação principal">
        <Brand />
        <div className="desktop-links"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#portfolio">Portfólio</a><a href="#planos">Planos</a></div>
        <div className="nav-actions"><Link href="/login" className="login-link">Entrar</Link><Link href="/cadastro" className="button button-small">Começar grátis <ArrowUpRight size={14} /></Link><button className="mobile-menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Fechar menu" : "Abrir menu"}>{open ? <X size={20} /> : <Menu size={20} />}</button></div>
        {open && <div id="mobile-menu" className="mobile-menu">{[["Como funciona", "#como-funciona"], ["Recursos", "#recursos"], ["Portfólio", "#portfolio"], ["Planos", "#planos"]].map(([label, href]) => <a href={href} key={href} onClick={() => setOpen(false)}>{label}</a>)}<Link href="/login">Entrar na plataforma</Link></div>}
      </nav>
    </header>
  );
}
