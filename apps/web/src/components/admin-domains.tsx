"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CheckCircle2, CircleDollarSign, Clipboard, ExternalLink, Globe, Hourglass, RefreshCw, Save, Trash2, XCircle } from "lucide-react";

interface PaymentInfo { id: string; provider: string; method: string; amount_cents: number; status: string; created_at: string }
export interface DomainAdminRow {
  id: string; userEmail: string; siteSlug: string; siteNome: string;
  desiredHost: string; host: string | null; status: string; priceCents: number;
  expiresAt: string | null; activatedAt: string | null; createdAt: string;
  payment: PaymentInfo | null;
  cfZoneId: string | null; cfNameservers: string[] | null; setupError: string | null;
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
  : "—";

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="dom-copy" title="Copiar"
    onClick={() => {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }}>
    {copied ? <CheckCircle2 size={13} /> : <Clipboard size={13} />}
    {copied ? "Copiado" : "Copiar"}
  </button>;
}

export function AdminDomains({ rows, priceCents, automation }: {
  rows: DomainAdminRow[]; priceCents: number; automation: boolean;
}) {
  const router = useRouter();
  const [price, setPrice] = useState((priceCents / 100).toFixed(2).replace(".", ","));
  const [hosts, setHosts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function send(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    setSaved("");
    const res = await fetch("/api/admin/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, motivo: reason.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error || "Não foi possível concluir."); return; }
    setSaved(data.message || "Salvo.");
    router.refresh();
  }

  function savePrice() {
    const cents = Math.round(Number(price.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 500) { setError("Informe um preço válido (mínimo R$ 5,00)."); return; }
    void send({ acao: "set-price", priceCents: cents }, "price");
  }

  const pending = rows.filter((r) => r.status === "pending_setup");
  const actives = rows.filter((r) => r.status === "active");
  const awaiting = rows.filter((r) => r.status === "pending_payment");
  const history = rows.filter((r) => ["rejected", "removed"].includes(r.status));

  const meta = (r: DomainAdminRow) => [
    r.siteNome,
    r.userEmail,
    `pedido ${fmtDate(r.createdAt)}`,
    r.payment && `${r.payment.provider === "stripe" ? "cartão" : "PIX"} ${money(r.payment.amount_cents)}`,
  ].filter(Boolean) as string[];

  return <div className="adm-dom">
    {error && <p role="alert" className="auth-error">{error}</p>}
    {saved && <p role="status" className="notice-ok"><CheckCircle2 size={16} />{saved}</p>}

    <section className="dash-panel adm-dom-price">
      <div className="dash-panel-heading"><h2><CircleDollarSign size={15} /> Preço anual do domínio</h2><strong>{money(priceCents)}/ano</strong></div>
      <div className="adm-dom-price-row">
        <input
          type="text" inputMode="decimal" placeholder="69,99"
          value={price} onChange={(e) => setPrice(e.target.value)}
          aria-label="Preço anual"
        />
        <button type="button" className="button button-primary button-small" disabled={busy !== null}
          onClick={savePrice}>
          <Save size={14} />{busy === "price" ? "Salvando..." : "Salvar"}
        </button>
        <input
          type="text" maxLength={300} value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (opcional — fica na auditoria)" aria-label="Motivo"
        />
      </div>
    </section>

    <section className="dash-panel">
      <div className="dash-panel-heading"><h2><Hourglass size={15} /> Aguardando configuração</h2><span className="adm-count">{pending.length}</span></div>
      {pending.length === 0 && <p className="dash-empty">Nenhum domínio na fila.</p>}
      {pending.map((r) => {
        const host = r.host ?? r.desiredHost;
        return <article className="adm-dom-card" key={r.id}>
          <header className="adm-dom-card-head">
            <strong><Globe size={14} />{host}</strong>
            <span className="domain-status domain-status-pending_setup">Pago — configurar</span>
          </header>
          <p className="adm-dom-meta">{meta(r).join(" · ")}</p>
          {r.setupError && <p className="dom-err">{r.setupError}</p>}

          {automation && <div className="dom-steps">
            <p className="dom-step"><span>1</span> Registre <code>{host}</code> no
              <a href="https://registro.br" target="_blank" rel="noreferrer">registro.br <ExternalLink size={11} /></a>
              <CopyBtn text={host} /></p>
            {r.cfNameservers && r.cfNameservers.length > 0
              ? <p className="dom-step"><span>2</span> Delegue para:
                  {r.cfNameservers.map((ns) => (
                    <code key={ns}>{ns}<CopyBtn text={ns} /></code>
                  ))}</p>
              : <p className="dom-step dom-step-todo"><span>2</span> Clique em
                  <b>Preparar DNS</b> pra gerar os nameservers</p>}
            <p className="dom-step"><span>3</span> Ativa sozinho quando a delegação propagar (~15min)</p>
          </div>}

          <footer className="adm-dom-actions">
            <input
              type="text"
              placeholder={r.desiredHost}
              value={hosts[r.id] ?? ""}
              onChange={(e) => setHosts((h) => ({ ...h, [r.id]: e.target.value }))}
              aria-label="Host definitivo"
            />
            {automation && !r.cfZoneId && (
              <button type="button" className="button button-glass button-small" disabled={busy !== null}
                onClick={() => void send({ acao: "provision", domainId: r.id, host: (hosts[r.id] || r.desiredHost).trim() }, `prov-${r.id}`)}>
                <RefreshCw size={14} />{busy === `prov-${r.id}` ? "Preparando..." : "Preparar DNS"}
              </button>
            )}
            <button type="button" className="button button-primary button-small" disabled={busy !== null}
              onClick={() => void send({ acao: "activate", domainId: r.id, host: (hosts[r.id] || r.desiredHost).trim() }, `act-${r.id}`)}>
              <BadgeCheck size={14} />{busy === `act-${r.id}` ? "Ativando..." : automation ? "Verificar e ativar" : "Ativar"}
            </button>
            <button type="button" className="editor-remove" disabled={busy !== null}
              onClick={() => void send({ acao: "reject", domainId: r.id }, `rej-${r.id}`)}>
              <XCircle size={14} />Rejeitar
            </button>
          </footer>
        </article>;
      })}
    </section>

    <section className="dash-panel">
      <div className="dash-panel-heading"><h2><BadgeCheck size={15} /> Domínios ativos</h2><span className="adm-count">{actives.length}</span></div>
      {actives.length === 0 && <p className="dash-empty">Nenhum domínio ativo ainda.</p>}
      {actives.map((r) => {
        const days = daysLeft(r.expiresAt);
        return <article className="adm-dom-card" key={r.id}>
          <header className="adm-dom-card-head">
            <strong><Globe size={14} />{r.host ?? r.desiredHost}</strong>
            <span className="domain-status domain-status-active">
              Ativo{days !== null && ` · ${days >= 0 ? `${days}d` : "expirado"}`}
            </span>
          </header>
          <p className="adm-dom-meta">
            {[...meta(r), days !== null && `renova até ${fmtDate(r.expiresAt)}`].filter(Boolean).join(" · ")}
          </p>
          <footer className="adm-dom-actions adm-dom-actions-end">
            <button type="button" className="button button-glass button-small" disabled={busy !== null}
              onClick={() => void send({ acao: "renew", domainId: r.id }, `ren-${r.id}`)}>
              <RefreshCw size={14} />{busy === `ren-${r.id}` ? "Renovando..." : "+1 ano"}
            </button>
            <button type="button" className="editor-remove" disabled={busy !== null}
              onClick={() => void send({ acao: "remove", domainId: r.id }, `rem-${r.id}`)}>
              <Trash2 size={14} />Remover
            </button>
          </footer>
        </article>;
      })}
    </section>

    {awaiting.length > 0 && <section className="dash-panel">
      <div className="dash-panel-heading"><h2><CircleDollarSign size={15} /> Aguardando pagamento</h2><span className="adm-count">{awaiting.length}</span></div>
      {awaiting.map((r) => <article className="adm-dom-card" key={r.id}>
        <header className="adm-dom-card-head">
          <strong><Globe size={14} />{r.desiredHost}</strong>
          <span className="domain-status domain-status-pending_payment">Aguardando PIX/cartão</span>
        </header>
        <p className="adm-dom-meta">{meta(r).join(" · ")}</p>
      </article>)}
    </section>}

    {history.length > 0 && <section className="dash-panel">
      <div className="dash-panel-heading"><h2><Trash2 size={15} /> Histórico</h2><span className="adm-count">{history.length}</span></div>
      {history.map((r) => <article className="adm-dom-card" key={r.id}>
        <header className="adm-dom-card-head">
          <strong><Globe size={14} />{r.host ?? r.desiredHost}</strong>
          <span className={`domain-status domain-status-${r.status}`}>{r.status === "rejected" ? "Rejeitado" : "Removido"}</span>
        </header>
        <p className="adm-dom-meta">{meta(r).join(" · ")}</p>
      </article>)}
    </section>}
  </div>;
}
