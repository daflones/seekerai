"use client";

import Image from "next/image";
import { useState } from "react";
import {
  BadgeCheck, BellRing, CheckCircle2, Copy, CreditCard, ExternalLink,
  Globe, Hourglass, Loader2, QrCode, SearchCheck, XCircle,
} from "lucide-react";
import { callAction } from "@/lib/app-client";
import { metaCookies, trackMeta } from "@/lib/meta";

interface SiteRow { slug: string; nome: string; tipo: string }
interface DomainRow {
  id: string; site_slug: string; desired_host: string; host: string | null;
  status: string; price_cents: number; expires_at: string | null; created_at: string;
}
interface NotifRow { id: string; tipo: string; titulo: string; corpo: string | null; lida: boolean; created_at: string }
interface PixResult { qrCode?: string | null; qrCodeImage?: string | null; expiresAt?: string | null }

const HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
  : "—";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  pending_setup: "Pago — configuração em até 48h",
  active: "Ativo",
  rejected: "Não ativado",
  removed: "Removido",
};

export function DomainManager({ sites, domains, notifications, priceCents, initialSite }: {
  sites: SiteRow[];
  domains: DomainRow[];
  notifications: NotifRow[];
  priceCents: number;
  initialSite?: string | null;
}) {
  const [selected, setSelected] = useState(() =>
    sites.some((s) => s.slug === initialSite) ? initialSite! : sites[0]?.slug ?? "");
  const [hosts, setHosts] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, { state: "busy" | "free" | "taken" | "unknown" }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pix, setPix] = useState<(PixResult & { host: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [notifs, setNotifs] = useState(notifications);

  const liveBySite = new Map(
    domains.filter((d) => d.status !== "rejected" && d.status !== "removed")
      .map((d) => [d.site_slug, d]));
  const unread = notifs.filter((n) => !n.lida);

  const selSite = sites.find((s) => s.slug === selected);
  const live = liveBySite.get(selected);
  const host = hosts[selected] ?? live?.desired_host ?? "";
  const check = checks[selected];
  const siteName = (slug: string) => sites.find((s) => s.slug === slug)?.nome ?? slug;

  async function checkDomain(siteSlug: string) {
    const host = (hosts[siteSlug] ?? "").trim().toLowerCase().replace(/^www\./, "");
    if (!HOST_RE.test(host)) { setError("Domínio inválido — use o formato exemplo.com.br"); return; }
    setError("");
    setChecks((c) => ({ ...c, [siteSlug]: { state: "busy" } }));
    const res = await fetch(`/api/domains/check?domain=${encodeURIComponent(host)}`);
    const data = await res.json().catch(() => ({}));
    setChecks((c) => ({
      ...c,
      [siteSlug]: {
        state: data.available === true ? "free" : data.available === false ? "taken" : "unknown",
      },
    }));
  }

  async function buy(siteSlug: string, method: "card" | "pix") {
    const host = (hosts[siteSlug] ?? "").trim().toLowerCase().replace(/^www\./, "");
    if (!HOST_RE.test(host)) { setError("Domínio inválido — use o formato exemplo.com.br"); return; }
    setBusy(`${siteSlug}:${method}`);
    setError("");
    trackMeta("InitiateCheckout", {
      value: priceCents / 100, currency: "BRL", content_name: `domain:${host}`,
    });
    const res = await callAction<{ checkoutUrl?: string } & PixResult>("billing-checkout", {
      method, currency: "brl", domainSiteSlug: siteSlug, domainHost: host, ...metaCookies(),
    });
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    if (method === "card" && res.data.checkoutUrl) {
      window.location.href = res.data.checkoutUrl;
      return;
    }
    setPix({ host, ...res.data });
  }

  async function copyPix(code: string) {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function markRead() {
    const ids = unread.map((n) => n.id);
    if (ids.length === 0) return;
    setNotifs((current) => current.map((n) => ({ ...n, lida: true })));
    await fetch("/api/domains/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }

  return <div className="plan-editor">
    {unread.length > 0 && <section className="dash-panel domain-notifs">
      <h2><BellRing size={16} /> Novidades dos seus domínios</h2>
      <ul className="dash-usage">
        {unread.map((n) => <li key={n.id}>
          <span><strong>{n.titulo}</strong>{n.corpo ? ` — ${n.corpo}` : ""}</span>
        </li>)}
      </ul>
      <div className="dash-links">
        <button type="button" className="text-link" onClick={() => void markRead()}>
          Marcar tudo como lido
        </button>
      </div>
    </section>}

    {error && <p role="alert" className="auth-error">{error}</p>}

    {sites.length === 0 && <p className="private-intro">
      Você ainda não tem sites publicados. Gere um site no radar ou no estúdio e volte aqui
      para apontar um domínio próprio.
    </p>}

    {sites.length > 0 && <section className="plan-card-checkout domain-buy">
      <h3><Globe size={15} /> Domínio personalizado</h3>
      <p className="domain-buy-pitch">
        Seu site no endereço que é só seu — tipo <strong>seunegocio.com.br</strong>.
        Passa muito mais credibilidade e ajuda a fechar o cliente.
      </p>

      <label className="editor-block-label">Para qual site?
        <select value={selected} onChange={(e) => { setSelected(e.target.value); setError(""); }}>
          {sites.map((s) => <option key={s.slug} value={s.slug}>{s.nome} · /site/{s.slug}</option>)}
        </select>
      </label>

      {selSite && <p className="plan-tagline domain-site-link">
        <a className="text-link" href={`/site/${selSite.slug}`} target="_blank" rel="noopener noreferrer">
          Ver site atual <ExternalLink size={11} />
        </a>
      </p>}

      {live && <p className={`domain-status domain-status-${live.status}`}>
        {live.status === "active" && <BadgeCheck size={14} />}
        {(live.status === "pending_setup" || live.status === "pending_payment") && <Hourglass size={14} />}
        <strong>{STATUS_LABEL[live.status] ?? live.status}</strong>
        {" · "}{live.host ?? live.desired_host}
        {live.status === "active" && live.expires_at && ` · até ${fmtDate(live.expires_at)}`}
      </p>}

      {(!live || live.status === "pending_payment") && <>
        <label className="editor-block-label">Domínio desejado
          <div className="domain-host-row">
            <input
              type="text"
              placeholder="suaempresa.com.br"
              value={host}
              onChange={(e) => setHosts((h) => ({ ...h, [selected]: e.target.value }))}
            />
            <button type="button" className="button button-glass button-small" disabled={busy !== null}
              onClick={() => void checkDomain(selected)}>
              {check?.state === "busy" ? <Loader2 size={14} className="spin" /> : <SearchCheck size={14} />}
              Verificar
            </button>
          </div>
        </label>
        {check?.state === "free" && <p className="domain-check is-free"><CheckCircle2 size={14} /> Parece disponível</p>}
        {check?.state === "taken" && <p className="domain-check is-taken"><XCircle size={14} /> Já registrado — você pode tentar outro</p>}
        {check?.state === "unknown" && <p className="domain-check"><SearchCheck size={14} /> Não conseguimos verificar — nossa equipe confere na ativação</p>}
        <div className="domain-pay">
          <button type="button" className="button button-primary" disabled>
            <CreditCard size={14} />
            Cartão (em breve)
          </button>
          <button type="button" className="button button-glass" disabled={busy !== null}
            onClick={() => void buy(selected, "pix")}>
            {busy === `${selected}:pix` ? <Loader2 size={14} className="spin" /> : <QrCode size={14} />}
            PIX · {money(priceCents)}
          </button>
        </div>
        <p className="plan-billed-caption">Anuidade única — ativação manual em até 48h após o pagamento.</p>
      </>}
    </section>}

    {domains.length > 0 && <section className="dash-panel domain-mine">
      <h2><Globe size={16} /> Meus domínios</h2>
      <ul className="domain-list">
        {domains.map((d) => <li key={d.id}>
          <span className="domain-list-host">
            <Globe size={13} />{d.host ?? d.desired_host}
          </span>
          <span className="domain-list-site">{siteName(d.site_slug)}</span>
          <span className={`domain-status domain-status-${d.status}`}>
            {d.status === "active" && <BadgeCheck size={13} />}
            {(d.status === "pending_setup" || d.status === "pending_payment") && <Hourglass size={13} />}
            {STATUS_LABEL[d.status] ?? d.status}
            {d.status === "active" && d.expires_at && ` · até ${fmtDate(d.expires_at)}`}
          </span>
        </li>)}
      </ul>
    </section>}

    {pix && <div className="pix-overlay" role="dialog" aria-modal="true" aria-label="PIX"
      onClick={() => setPix(null)}>
      <section className="pix-panel pix-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pix-close" aria-label="×" onClick={() => setPix(null)}>×</button>
        <h2><QrCode size={18} /> Domínio {pix.host}</h2>
        <p className="plan-price pix-price">{money(priceCents)}<small>/ano</small></p>
        {pix.qrCodeImage && <Image className="pix-qr" src={pix.qrCodeImage} alt="QR Code PIX" width={210} height={210} unoptimized />}
        {pix.qrCode && <div className="pix-code">
          <code>{pix.qrCode}</code>
          <button type="button" className="button button-glass button-small" onClick={() => void copyPix(pix.qrCode!)}>
            <Copy size={14} />{copied ? "Copiado!" : "Copiar código"}
          </button>
        </div>}
        <p className="seek-meta">
          Pague com o app do seu banco.
          {pix.expiresAt && ` Válido até ${new Date(pix.expiresAt).toLocaleString()}.`}
          {" "}Após a confirmação, ativamos seu domínio em até 48h.
        </p>
      </section>
    </div>}
  </div>;
}
