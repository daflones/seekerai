"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Coins, Crown, Loader2, MessageCircle, Phone, Search, UserRound } from "lucide-react";
import type { AdminUserRow } from "@/lib/admin-users";

const STAGE_LABELS: Record<string, string> = {
  novo: "Novo", contatado: "Contatado", respondeu: "Respondeu",
  proposta: "Proposta", ganho: "Ganho", perdido: "Perdido",
};
const OUTPUT_LABELS: Record<string, string> = {
  sales_reply: "Mensagem", deep_strategy: "Estratégia",
  generate_site: "Site", generate_image: "Imagem", image_prompt: "Prompt de imagem",
};
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTag = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
  : "—";
const periodLabel = (months: number) =>
  months === 1 ? "mensal" : months === 3 ? "trimestral" : months === 12 ? "anual" : `${months} meses`;

// Telefones chegam em formatos variados (+55, com espaço, sem DDI).
const fmtPhone = (t: string | null) => {
  if (!t) return "";
  const d = t.replace(/\D/g, "");
  const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return t;
};
const waLink = (t: string | null) => {
  if (!t) return null;
  const d = t.replace(/\D/g, "");
  const full = d.startsWith("55") ? d : `55${d}`;
  return full.length >= 12 ? `https://wa.me/${full}` : null;
};

export function AdminUsers({ users, plans }: {
  users: AdminUserRow[];
  plans: { slug: string; nome: string; creditos_mensais: number }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "assinantes" | "gratuitos" | "admins">("todos");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [delta, setDelta] = useState<Record<string, string>>({});
  const [planSel, setPlanSel] = useState<Record<string, string>>({});
  const [chatMsg, setChatMsg] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users.filter((u) => {
      if (filtro === "assinantes" && u.subStatus !== "active") return false;
      if (filtro === "gratuitos" && u.subStatus === "active") return false;
      if (filtro === "admins" && u.role !== "admin") return false;
      if (term
        && !u.nome.toLowerCase().includes(term)
        && !u.email.toLowerCase().includes(term)
        && !(u.telefone ?? "").replace(/\D/g, "").includes(term.replace(/\D/g, "") || "￿")) return false;
      return true;
    });
  }, [users, q, filtro]);

  async function run(userId: string, payload: Record<string, unknown>) {
    setBusy(userId); setErro("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(data.error ?? "Ação falhou."); return; }
      router.refresh();
    } finally { setBusy(null); }
  }

  // Abre uma conversa direta com o usuário — vira um chamado humano e
  // cai na lista de chamados já aberta pra continuar a conversa.
  async function startChat(userId: string) {
    const mensagem = (chatMsg[userId] ?? "").trim();
    if (!mensagem || busy === userId) return;
    setBusy(userId); setErro("");
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, mensagem }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) { setErro(data.error ?? "Não foi possível iniciar a conversa."); return; }
      router.push(`/admin/chamados?abrir=${data.id}`);
    } finally { setBusy(null); }
  }

  return (
    <div className="admin-users">
      <div className="admin-users-toolbar">
        <label className="admin-users-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou e-mail…" />
        </label>
        <div className="lead-filters admin-users-filters">
          {([["todos", "Todos"], ["assinantes", "Assinantes"], ["gratuitos", "Gratuitos"], ["admins", "Admins"]] as const).map(([k, label]) => (
            <button key={k} className={filtro === k ? "active" : ""} onClick={() => setFiltro(k)}>{label}</button>
          ))}
        </div>
      </div>
      {erro && <p className="admin-users-error">{erro}</p>}

      <div className="admin-users-list">
        {list.length === 0 && <p className="dash-empty">Nenhum usuário encontrado.</p>}
        {list.map((u) => {
          const open = openId === u.id;
          return (
            <article key={u.id} className={`admin-user${open ? " is-open" : ""}`}>
              <button className="admin-user-head" onClick={() => setOpenId(open ? null : u.id)}>
                <span className="admin-user-avatar"><UserRound size={16} /></span>
                <span className="admin-user-id">
                  <strong>{u.nome}</strong>
                  <small>{[u.email, fmtPhone(u.telefone)].filter(Boolean).join(" · ") || u.id}</small>
                </span>
                <span className={`admin-user-plan${u.subStatus === "active" ? " is-active" : ""}`}>
                  {u.subStatus === "active"
                    ? <><Crown size={12} /> {u.planNome}{u.billingMonths ? ` · ${periodLabel(u.billingMonths)}` : ""}</>
                    : "Gratuito"}
                </span>
                <span className="admin-user-saldo"><Coins size={12} /> {u.saldo} cr</span>
                <span className="admin-user-meta">{u.leadsTotal} leads · {u.outputsTotal} criações</span>
                <span className="admin-user-date">{dateTag(u.createdAt)}</span>
                <ChevronDown size={15} className="admin-user-caret" />
              </button>

              {open && (
                <div className="admin-user-body">
                  <div className="admin-user-cols">
                    <section>
                      <h4>Conta</h4>
                      <dl className="admin-user-dl">
                        <div><dt>ID</dt><dd className="mono">{u.id.slice(0, 8)}…</dd></div>
                        <div><dt>Telefone</dt><dd>
                          {u.telefone
                            ? <>{fmtPhone(u.telefone)}{waLink(u.telefone) && (
                                <a className="au-wa" href={waLink(u.telefone)!} target="_blank" rel="noreferrer" title="Abrir no WhatsApp">
                                  <Phone size={11} /> WhatsApp
                                </a>)}</>
                            : "—"}
                        </dd></div>
                        <div><dt>Role</dt><dd>{u.role}</dd></div>
                        <div><dt>Onboarding</dt><dd>{u.onboarding ? "Concluído" : "Pendente"}</dd></div>
                        <div><dt>Assinatura</dt><dd>{u.subStatus ?? "nenhuma"}{u.subStatus ? ` ${u.planNome ?? ""}${u.billingMonths ? ` · ${periodLabel(u.billingMonths)}` : ""}` : ""}{u.periodEnd ? ` · até ${dateTag(u.periodEnd)}` : ""}</dd></div>
                        <div><dt>Fechado em vendas</dt><dd>{money(u.valorFechado)}</dd></div>
                      </dl>
                    </section>
                    <section>
                      <h4>Funil de leads</h4>
                      <ul className="admin-user-stages">
                        {Object.entries(u.leads).map(([k, v]) => (
                          <li key={k}><span className={`lead-status lead-status-${k}`}>{STAGE_LABELS[k]}</span><strong>{v}</strong></li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4>Criações</h4>
                      {u.outputsTotal === 0
                        ? <p className="dash-empty">Nada gerado ainda.</p>
                        : <ul className="admin-user-stages">
                            {Object.entries(u.outputs).map(([k, v]) => (
                              <li key={k}><span>{OUTPUT_LABELS[k] ?? k}</span><strong>{v}</strong></li>
                            ))}
                          </ul>}
                      {(u.jobsRunning > 0 || u.jobsError > 0) && (
                        <p className="admin-user-jobs">
                          {u.jobsRunning > 0 && <span className="is-running">Gerando agora: {u.jobsRunning}</span>}
                          {u.jobsError > 0 && <span className="is-error">Com erro: {u.jobsError}</span>}
                        </p>
                      )}
                    </section>
                  </div>

                  <div className="admin-user-actions">
                    <section className="au-action">
                      <h4>Plano</h4>
                      <div className="au-action-row">
                        <select value={planSel[u.id] ?? u.planSlug ?? ""} onChange={(e) => setPlanSel((s) => ({ ...s, [u.id]: e.target.value }))}>
                          <option value="" disabled>Escolher plano…</option>
                          {plans.map((p) => <option key={p.slug} value={p.slug}>{p.nome} · {p.creditos_mensais} cr/mês</option>)}
                        </select>
                        <button className="btn-admin" disabled={busy === u.id || !(planSel[u.id] ?? "").trim()}
                          onClick={() => run(u.id, { action: "set_plan", planSlug: planSel[u.id] })}>
                          Aplicar
                        </button>
                      </div>
                      {u.subStatus === "active" && (
                        <button className="btn-admin btn-admin-danger" disabled={busy === u.id}
                          onClick={() => { if (confirm(`Cancelar a assinatura de ${u.nome}?`)) run(u.id, { action: "cancel_sub" }); }}>
                          Cancelar assinatura
                        </button>
                      )}
                    </section>
                    <section className="au-action">
                      <h4>Créditos · saldo {u.saldo} cr</h4>
                      <div className="au-action-row">
                        <input type="number" placeholder="Ex.: 50 ou -20" value={delta[u.id] ?? ""}
                          onChange={(e) => setDelta((s) => ({ ...s, [u.id]: e.target.value }))} />
                        <button className="btn-admin" disabled={busy === u.id || !Number(delta[u.id])}
                          onClick={() => run(u.id, { action: "adjust_credits", delta: Number(delta[u.id]) })}>
                          Ajustar
                        </button>
                      </div>
                      <div className="au-chips">
                        {[20, 50, 100, -20].map((n) => (
                          <button key={n} type="button" className="au-chip"
                            onClick={() => setDelta((s) => ({ ...s, [u.id]: String(n) }))}>
                            {n > 0 ? `+${n}` : n}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="au-action">
                      <h4>Conversa direta</h4>
                      <div className="au-action-row">
                        <input type="text" placeholder="Primeira mensagem pro usuário…" maxLength={4000}
                          value={chatMsg[u.id] ?? ""}
                          onChange={(e) => setChatMsg((s) => ({ ...s, [u.id]: e.target.value }))} />
                        <button className="btn-admin" disabled={busy === u.id || !(chatMsg[u.id] ?? "").trim()}
                          onClick={() => void startChat(u.id)}>
                          {busy === u.id ? <Loader2 size={13} className="spin" /> : <MessageCircle size={13} />}
                          Iniciar chat
                        </button>
                      </div>
                    </section>
                  </div>
                  <p className="admin-user-note">Aplicar plano repõe a cota mensal do plano. Ajustes de saldo ficam registrados no extrato de créditos.</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
