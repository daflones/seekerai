"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CheckCircle2, CircleDollarSign, Hourglass, RefreshCw, Save, Trash2, XCircle } from "lucide-react";

interface PaymentInfo { id: string; provider: string; method: string; amount_cents: number; status: string; created_at: string }
export interface DomainAdminRow {
  id: string; userEmail: string; siteSlug: string; siteNome: string;
  desiredHost: string; host: string | null; status: string; priceCents: number;
  expiresAt: string | null; activatedAt: string | null; createdAt: string;
  payment: PaymentInfo | null;
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
  : "—";
const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  pending_setup: "Pago — configurar",
  active: "Ativo",
  rejected: "Rejeitado",
  removed: "Removido",
};

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function AdminDomains({ rows, priceCents }: { rows: DomainAdminRow[]; priceCents: number }) {
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

  const groups: { status: string[]; title: string; icon: React.ReactNode }[] = [
    { status: ["pending_setup"], title: "Pagos — aguardando configuração (SLA 48h)", icon: <Hourglass size={15} /> },
    { status: ["active"], title: "Domínios ativos", icon: <BadgeCheck size={15} /> },
    { status: ["pending_payment"], title: "Aguardando pagamento", icon: <CircleDollarSign size={15} /> },
    { status: ["rejected", "removed"], title: "Histórico", icon: <Trash2 size={15} /> },
  ];

  return <div className="plan-editor">
    {error && <p role="alert" className="auth-error">{error}</p>}
    {saved && <p role="status" className="editor-saved"><CheckCircle2 size={16} />{saved}</p>}

    <fieldset disabled={busy !== null} className="editor-form">
      <legend><CircleDollarSign size={15} /> Preço anual do domínio</legend>
      <div className="editor-feature">
        <div>
          <strong>{money(priceCents)}/ano</strong>
          <small>cobrança única — hospedagem + configuração manual</small>
        </div>
        <input
          type="text" inputMode="decimal" placeholder="69,99"
          value={price} onChange={(e) => setPrice(e.target.value)}
        />
        <button type="button" className="button button-primary" disabled={busy !== null}
          onClick={savePrice}>
          <Save size={15} />{busy === "price" ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <label className="editor-block-label">Motivo <small>(opcional — fica na auditoria)</small>
        <textarea maxLength={300} rows={2} value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder="Ex.: ajuste de preço / observação sobre o pedido" />
      </label>
    </fieldset>

    {groups.map((group) => {
      const items = rows.filter((r) => group.status.includes(r.status));
      return <fieldset key={group.title} disabled={busy !== null} className="editor-form">
        <legend>{group.icon} {group.title} <small>({items.length})</small></legend>
        {items.length === 0 && <p className="editor-hint">Nada por aqui.</p>}
        <div className="editor-features">
          {items.map((r) => {
            const days = daysLeft(r.expiresAt);
            return <div className="editor-feature" key={r.id}>
              <div>
                <strong>{r.host ?? r.desiredHost}</strong>
                <small>{r.siteNome} · /site/{r.siteSlug}</small>
                <small>{r.userEmail} · pedido {fmtDate(r.createdAt)}</small>
                <small suppressHydrationWarning>
                  {STATUS_LABEL[r.status] ?? r.status}
                  {r.payment && ` · ${r.payment.provider === "stripe" ? "cartão" : "PIX"} ${money(r.payment.amount_cents)} (${r.payment.status})`}
                  {r.status === "active" && days !== null && ` · ${days >= 0 ? `${days}d restantes` : "expirado"} · até ${fmtDate(r.expiresAt)}`}
                </small>
              </div>
              {r.status === "pending_setup" && <>
                <input
                  type="text"
                  placeholder={r.desiredHost}
                  value={hosts[r.id] ?? ""}
                  onChange={(e) => setHosts((h) => ({ ...h, [r.id]: e.target.value }))}
                />
                <button type="button" className="button button-primary" disabled={busy !== null}
                  onClick={() => void send({ acao: "activate", domainId: r.id, host: (hosts[r.id] || r.desiredHost).trim() }, `act-${r.id}`)}>
                  <BadgeCheck size={15} />{busy === `act-${r.id}` ? "Ativando..." : "Ativar"}
                </button>
                <button type="button" className="editor-remove" disabled={busy !== null}
                  onClick={() => void send({ acao: "reject", domainId: r.id }, `rej-${r.id}`)}>
                  <XCircle size={15} />Rejeitar
                </button>
              </>}
              {r.status === "active" && <>
                <button type="button" className="button button-glass" disabled={busy !== null}
                  onClick={() => void send({ acao: "renew", domainId: r.id }, `ren-${r.id}`)}>
                  <RefreshCw size={15} />{busy === `ren-${r.id}` ? "Renovando..." : "+1 ano"}
                </button>
                <button type="button" className="editor-remove" disabled={busy !== null}
                  onClick={() => void send({ acao: "remove", domainId: r.id }, `rem-${r.id}`)}>
                  <Trash2 size={15} />Remover
                </button>
              </>}
            </div>;
          })}
        </div>
      </fieldset>;
    })}
  </div>;
}
