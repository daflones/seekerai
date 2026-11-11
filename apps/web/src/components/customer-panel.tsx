"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, ChevronDown, CreditCard, Loader2, Minus, Plus, Trash2, UserRound, Wallet } from "lucide-react";

interface CustomerData {
  perfil: { id: string; nome: string | null; telefone: string | null; role: string; created_at: string };
  assinatura: {
    id: string; status: string; current_period_end: string | null;
    billing_months: number | null; provider: string | null; plano: string | null;
  } | null;
  saldo: number;
  uso: { buscas: number; leads: number; criacoes: number; apps: number };
  pagamentos: { id: string; status: string; method: string | null; provider: string | null; amount_cents: number | null; created_at: string }[];
  planos: { id: string; slug: string; nome: string; creditos_mensais: number; preco_centavos: number }[];
}

const BRL = (cents: number | null | undefined) =>
  typeof cents === "number" ? `R$${(cents / 100).toFixed(2).replace(".", ",")}` : "—";
const PAY_LABEL: Record<string, string> = {
  paid: "pago", pending: "pendente", failed: "falhou",
  canceled: "cancelado", refunded: "reembolsado", expired: "expirado",
};

// Resumo + ações do cliente dentro do chamado — o admin resolve plano,
// créditos e conta sem sair da conversa.
export function CustomerPanel({ userId, cliente }: { userId: string; cliente?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CustomerData | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [planSlug, setPlanSlug] = useState("");
  const [delta, setDelta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const res = await fetch(`/api/admin/customer?user=${userId}`, { cache: "no-store" }).catch(() => null);
    const j = res?.ok ? await res.json().catch(() => null) : null;
    if (!j) { setErr("Não foi possível carregar o cliente."); return; }
    setData(j);
    setPlanSlug((j.planos as CustomerData["planos"])[0]?.slug ?? "");
  }, [userId]);

  useEffect(() => { if (open && !data) void load(); }, [open, data, load]);

  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(String(body.action));
    setErr(""); setNote("");
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...body }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setBusy(null);
    if (!res?.ok) { setErr(j?.error ?? "Não foi possível concluir."); return; }
    if (body.action === "delete_account") { setData(null); setNote("Conta excluída."); return; }
    setNote(body.action === "set_plan" ? `Plano ${j?.plano ?? ""} aplicado.` :
      body.action === "cancel_sub" ? "Assinatura cancelada." :
      `Saldo ajustado: ${j?.saldo ?? "?"} créditos.`);
    await load();
  }

  const p = data?.perfil;
  const sub = data?.assinatura;
  const subAtiva = sub?.status === "active";

  return <div className="cust-panel">
    <button type="button" className={`cust-toggle ${open ? "active" : ""}`} onClick={() => setOpen(!open)}>
      <UserRound size={14} /> Cliente
      <span>{p?.nome ?? cliente ?? ""}{subAtiva ? ` · ${sub?.plano}` : " · sem assinatura"}{data ? ` · ${data.saldo} cr` : ""}</span>
      <ChevronDown size={14} className={open ? "flip" : ""} />
    </button>
    {open && (
      <div className="cust-body">
        {!data && !err && <p className="chat-loading"><Loader2 size={14} className="spin" /> Carregando cliente…</p>}
        {err && <p className="form-error">{err}</p>}
        {note && <p className="cust-note">{note}</p>}
        {data && p && (
          <>
            <div className="cust-grid">
              <div><b>{p.nome ?? "—"}</b><small>{p.telefone ?? "sem telefone"} · desde {new Date(p.created_at).toLocaleDateString("pt-BR")}</small></div>
              <div>
                <span className={`cust-pill ${subAtiva ? "ok" : ""}`}>
                  {subAtiva ? `${sub?.plano ?? "plano"} ativo` : "sem assinatura"}
                </span>
                <small>
                  {subAtiva && sub?.current_period_end
                    ? `até ${new Date(sub.current_period_end).toLocaleDateString("pt-BR")} · ${sub.provider ?? ""}`
                    : ""}
                </small>
              </div>
              <div><Wallet size={13} /> <b>{data.saldo}</b> créditos</div>
            </div>
            <div className="cust-usage">
              {data.uso.buscas} buscas · {data.uso.leads} leads · {data.uso.criacoes} criações · {data.uso.apps} apps
            </div>
            {data.pagamentos.length > 0 && (
              <ul className="cust-pays">
                {data.pagamentos.map((pay) => (
                  <li key={pay.id}>
                    <CreditCard size={12} /> {pay.method ?? pay.provider ?? "—"} · {BRL(pay.amount_cents)} ·{" "}
                    <b className={`pay-${pay.status}`}>{PAY_LABEL[pay.status] ?? pay.status}</b> ·{" "}
                    {new Date(pay.created_at).toLocaleDateString("pt-BR")}
                  </li>
                ))}
              </ul>
            )}
            <div className="cust-actions">
              <label>
                Plano
                <select value={planSlug} onChange={(e) => setPlanSlug(e.target.value)}>
                  {data.planos.map((pl) => (
                    <option key={pl.id} value={pl.slug}>{pl.nome} · {pl.creditos_mensais}cr · {BRL(pl.preco_centavos)}/mês</option>
                  ))}
                </select>
              </label>
              <button type="button" className="status-btn status-ia" disabled={!planSlug || busy !== null}
                onClick={() => void act({ action: "set_plan", planSlug })}>
                {busy === "set_plan" ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                {subAtiva ? "Trocar plano" : "Ativar plano"}
              </button>
              {subAtiva && (
                <button type="button" className="status-btn" disabled={busy !== null}
                  onClick={() => void act({ action: "cancel_sub" })}>
                  {busy === "cancel_sub" ? <Loader2 size={13} className="spin" /> : <Ban size={13} />}
                  Cancelar plano
                </button>
              )}
            </div>
            <div className="cust-actions">
              <label>
                Créditos
                <input type="number" placeholder="ex.: 50" value={delta}
                  onChange={(e) => setDelta(e.target.value)} />
              </label>
              <label className="grow">
                Motivo
                <input type="text" placeholder="cortesia, ajuste, reembolso…" value={motivo}
                  onChange={(e) => setMotivo(e.target.value)} />
              </label>
              <button type="button" className="status-btn" disabled={busy !== null || !Number(delta)}
                onClick={() => void act({ action: "adjust_credits", delta: Math.abs(Number(delta)), motivo: motivo || "Cortesia do suporte" })}>
                <Plus size={13} /> Dar
              </button>
              <button type="button" className="status-btn" disabled={busy !== null || !Number(delta)}
                onClick={() => void act({ action: "adjust_credits", delta: -Math.abs(Number(delta)), motivo: motivo || "Ajuste do suporte" })}>
                <Minus size={13} /> Tirar
              </button>
            </div>
            <div className="cust-danger">
              {!confirmDel ? (
                <button type="button" className="status-btn cust-del" onClick={() => setConfirmDel(true)}>
                  <Trash2 size={13} /> Excluir conta
                </button>
              ) : (
                <span className="cust-del-confirm">
                  Excluir definitivamente? Leads, sites e créditos somem.
                  <button type="button" className="status-btn cust-del" disabled={busy !== null}
                    onClick={() => void act({ action: "delete_account" })}>
                    {busy === "delete_account" ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} Confirmar exclusão
                  </button>
                  <button type="button" className="status-btn" onClick={() => setConfirmDel(false)}>Voltar</button>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    )}
  </div>;
}
