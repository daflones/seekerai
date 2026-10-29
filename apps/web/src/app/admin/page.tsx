import Link from "next/link";
import {
  Activity, ArrowUpRight, Compass, CreditCard, Headset, Layers,
  LockKeyhole, Radar, ReceiptText, Settings2, ShieldCheck, Sparkles,
  TrendingUp, Users, Workflow,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { authReady } from "@/lib/auth/config";
import { AdminCreditos } from "@/components/admin-creditos";
import { AdminTools } from "@/components/admin-tools";

const ACTION_LABELS: Record<string, string> = {
  search: "Busca",
  generate_site: "Criação de site",
  generate_app: "App do estúdio",
  generate_image: "Criação de imagem",
  deep_strategy: "Estratégia aprofundada",
  sales_reply: "IA para conversas",
  whatsapp_check: "Verificação de WhatsApp",
  image_prompt: "Prompt de imagem",
  lead_assist: "Copiloto de conversão",
};

const LEAD_STATUS_LABEL: Record<string, string> = {
  novo: "Novos", contatado: "Contatados", respondeu: "Responderam",
  proposta: "Proposta", ganho: "Ganhos", perdido: "Perdidos",
};
const LEAD_ORDER = ["novo", "contatado", "respondeu", "proposta", "ganho", "perdido"];

const TICKET_STATUS_LABEL: Record<string, string> = {
  aberto: "Abertos", em_andamento: "Em andamento", pendente: "Pendentes",
  resolvido: "Resolvidos", cancelado: "Cancelados", expirado: "Expirados",
};

const DAY = 24 * 60 * 60 * 1000;
const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Server component renderiza no fuso do host (UTC) — fixa BR pra exibição.
const fmtHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function daySeries(dates: string[], days = 30): { label: string; value: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = new Array<number>(days).fill(0);
  for (const d of dates) {
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) continue;
    const diff = Math.floor((today.getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / DAY);
    if (diff >= 0 && diff < days) buckets[days - 1 - diff] += 1;
  }
  return buckets.map((value, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * DAY);
    return { label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, value };
  });
}

function daySum(pairs: { date: string; amount: number }[], days = 30): { label: string; value: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = new Array<number>(days).fill(0);
  for (const p of pairs) {
    const t = new Date(p.date);
    if (Number.isNaN(t.getTime())) continue;
    const diff = Math.floor((today.getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / DAY);
    if (diff >= 0 && diff < days) buckets[days - 1 - diff] += p.amount;
  }
  return buckets.map((value, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * DAY);
    return { label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, value };
  });
}

function sumDays(dates: string[], days: number, skip = 0): number {
  const cutoff = Date.now() - (skip + days) * DAY;
  const upper = Date.now() - skip * DAY;
  return dates.filter((d) => {
    const t = new Date(d).getTime();
    return t >= cutoff && t < upper;
  }).length;
}

function Delta({ now, before, suffix = "7d" }: { now: number; before: number; suffix?: string }) {
  if (now === 0 && before === 0) return null;
  const diff = now - before;
  const cls = diff > 0 ? "adm-delta-up" : diff < 0 ? "adm-delta-down" : "adm-delta-flat";
  const arrow = diff > 0 ? "↗" : diff < 0 ? "↘" : "→";
  return <span className={`adm-delta ${cls}`}>{arrow} {diff >= 0 ? "+" : ""}{diff} vs {suffix} anterior</span>;
}

function Bars({ data, money }: { data: { label: string; value: number }[]; money?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="adm-bars" role="img">
      {data.map((d, i) => (
        <span key={i} className="adm-bar-wrap" title={`${d.label}: ${money ? brl(d.value) : d.value}`}>
          <span className="adm-bar" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function ChartCard({ title, hint, data, money }: { title: string; hint: string; data: { label: string; value: number }[]; money?: boolean }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <section className="adm-chart">
      <div className="adm-chart-head">
        <small>{title}</small>
        <strong>{money ? brl(total) : total}</strong>
      </div>
      <Bars data={data} money={money} />
      <div className="adm-chart-foot"><span>{data[0]?.label}</span><span>{hint}</span><span>{data[data.length - 1]?.label}</span></div>
    </section>
  );
}

function DistRow({ label, value, max, mono }: { label: string; value: number | string; max?: number; mono?: boolean }) {
  const n = typeof value === "number" ? value : 0;
  const pct = max ? Math.max(3, (n / max) * 100) : 0;
  return (
    <li className="adm-dist-row">
      <span className="adm-dist-label">{label}</span>
      {max !== undefined && <span className="adm-dist-track"><span className="adm-dist-fill" style={{ width: `${pct}%` }} /></span>}
      <strong className={mono ? "adm-mono" : ""}>{value}</strong>
    </li>
  );
}

export default async function AdminPage() {
  const { supabase } = await requireSession("/admin", { admin: true });
  const since60 = new Date(Date.now() - 60 * DAY).toISOString();
  const [
    { count: usuarios },
    { data: profilesRecent },
    { data: settings },
    { data: rules },
    { data: subs },
    { data: leadsRows },
    { data: ops30 },
    { data: tickets },
    { data: payments60 },
    { data: sjRows },
    { data: ajRows },
    { count: sitesCount },
    { count: domainsCount },
    { data: audit },
    { data: plansData },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("created_at").gte("created_at", since60).limit(5000),
    supabase.from("credit_settings").select("welcome_credits").single(),
    supabase.from("credit_action_rules").select("action,cost,enabled").order("action"),
    supabase.from("subscriptions").select("status,billing_months, plans(slug,nome,preco_centavos)").eq("status", "active"),
    supabase.from("leads").select("status").limit(10000),
    supabase.from("credit_operations").select("action,cost,status,created_at").gte("created_at", since60).limit(20000),
    supabase.from("support_tickets").select("status,atendente").limit(500),
    supabase.from("payments").select("status,provider,method,amount_cents,metadata,created_at").gte("created_at", since60).limit(3000),
    supabase.from("search_jobs").select("status,created_at").limit(2000),
    supabase.from("ai_jobs").select("status,created_at").limit(2000),
    supabase.from("sites").select("slug", { count: "exact", head: true }).eq("publicado", true),
    supabase.from("domains").select("id", { count: "exact", head: true }).in("status", ["active", "pending_setup"]),
    supabase.from("audit_log").select("acao,alvo,diff,created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("plans").select("id,slug,nome,creditos_mensais").eq("ativo", true).order("ordem"),
  ]);

  const signDates = (profilesRecent ?? []).map((p) => p.created_at as string);
  const paidRows = (payments60 ?? []).filter((p) => p.status === "paid");
  const paidCents30 = paidRows.filter((p) => new Date(p.created_at).getTime() > Date.now() - 30 * DAY)
    .reduce((a, p) => a + (p.amount_cents ?? 0), 0);
  const paidCentsPrev = paidRows.filter((p) => {
    const t = new Date(p.created_at).getTime();
    return t <= Date.now() - 30 * DAY && t > Date.now() - 60 * DAY;
  }).reduce((a, p) => a + (p.amount_cents ?? 0), 0);

  const searchesDates = (ops30 ?? []).filter((o) => o.action === "search" && o.status === "completed")
    .map((o) => o.created_at as string);
  const creditDates = (ops30 ?? []).filter((o) => o.status === "completed")
    .flatMap((o) => Array(o.cost ?? 0).fill(o.created_at as string));
  const creditSum30 = (ops30 ?? []).filter((o) => o.status === "completed" && new Date(o.created_at).getTime() > Date.now() - 30 * DAY)
    .reduce((a, o) => a + (o.cost ?? 0), 0);

  const porAcao = Object.entries(
    (ops30 ?? []).filter((o) => o.status === "completed")
      .reduce<Record<string, number>>((acc, o) => {
        acc[o.action] = (acc[o.action] ?? 0) + (o.cost ?? 0);
        return acc;
      }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxAcao = Math.max(1, ...porAcao.map(([, v]) => v));

  const mrr = (subs ?? []).reduce((acc, s) => {
    const plano = s.plans as unknown as { preco_centavos: number } | null;
    const months = (s as { billing_months?: number }).billing_months ?? 1;
    const monthly = plano ? (plano.preco_centavos * (months === 12 ? 0.8 : months === 3 ? 0.9 : 1)) : 0;
    return acc + monthly;
  }, 0);
  const byPlan = (subs ?? []).reduce<Record<string, number>>((acc, s) => {
    const slug = (s.plans as unknown as { slug?: string })?.slug ?? "?";
    acc[slug] = (acc[slug] ?? 0) + 1;
    return acc;
  }, {});
  const maxPlan = Math.max(1, ...Object.values(byPlan));

  const byStatus = (leadsRows ?? []).reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});
  const maxLead = Math.max(1, ...Object.values(byStatus));
  const leadsTotal = (leadsRows ?? []).length;

  const ticketByStatus = (tickets ?? []).reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const maxTicket = Math.max(1, ...Object.values(ticketByStatus));
  const ticketByAtt = (tickets ?? []).reduce<Record<string, number>>((acc, t) => {
    acc[t.atendente] = (acc[t.atendente] ?? 0) + 1;
    return acc;
  }, {});
  const openStatuses = ["aberto", "em_andamento", "pendente"];
  const openTickets = (tickets ?? []).filter((t) => openStatuses.includes(t.status)).length;
  const humanQueue = (tickets ?? []).filter((t) => openStatuses.includes(t.status) && t.atendente === "admin").length;

  const tally = (rows: { status: string }[] | null) =>
    (rows ?? []).reduce<Record<string, number>>((a, r) => {
      a[r.status] = (a[r.status] ?? 0) + 1; return a;
    }, {});
  const sj = tally(sjRows);
  const aj = tally(ajRows);
  const stale = new Date(Date.now() - 10 * 60 * 1000);
  const stuck = [...(sjRows ?? []), ...(ajRows ?? [])]
    .filter((j) => j.status === "running" && new Date(j.created_at) < stale).length;
  const runningJobs = (sj.running ?? 0) + (aj.running ?? 0);

  const signup7 = sumDays(signDates, 7);
  const signupPrev7 = sumDays(signDates, 7, 7);
  const search7 = sumDays(searchesDates, 7);
  const searchPrev7 = sumDays(searchesDates, 7, 7);

  const lastPayments = [...(payments60 ?? [])]
    .sort((a, b) => (b.created_at as string).localeCompare(a.created_at as string))
    .slice(0, 8);

  return <>
    <span className="eyebrow">CONTROLE TOTAL</span>
    <h1>Painel administrativo<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Visão viva da operação — usuários, receita, radar, créditos, chamados, fila e
      auditoria. Acesso autorizado por sessão e role no servidor.
    </p>

    <div className="adm-strip">
      <span className={`adm-pill ${authReady() ? "adm-pill-ok" : "adm-pill-warn"}`}>
        <LockKeyhole size={12} /> Auth {authReady() ? "ativa" : "pendente"}
      </span>
      <span className="adm-pill adm-pill-ok"><Sparkles size={12} /> Agente IA no suporte</span>
      <span className={`adm-pill ${stuck > 0 ? "adm-pill-warn" : "adm-pill-ok"}`}>
        <Activity size={12} /> {stuck > 0 ? `${stuck} job(s) travado(s)` : "Fila saudável"}
      </span>
      <span className={`adm-pill ${humanQueue > 0 ? "adm-pill-warn" : "adm-pill-ok"}`}>
        <Headset size={12} /> {humanQueue} chamado(s) na fila humana
      </span>
    </div>

    <div className="stat-grid">
      <section className="stat-card"><span className="stat-icon"><Users size={18} /></span>
        <small>USUÁRIOS</small><strong>{usuarios ?? "—"}</strong>
        <span className="stat-sub"><Delta now={signup7} before={signupPrev7} /></span></section>
      <section className="stat-card"><span className="stat-icon"><CreditCard size={18} /></span>
        <small>ASSINATURAS ATIVAS</small><strong>{(subs ?? []).length}</strong>
        <span className="stat-sub">MRR ≈ {brl(mrr)}</span></section>
      <section className="stat-card"><span className="stat-icon"><ReceiptText size={18} /></span>
        <small>RECEITA 30D</small><strong>{brl(paidCents30)}</strong>
        <span className="stat-sub">{paidCentsPrev > 0 ? `vs ${brl(paidCentsPrev)} nos 30d anteriores` : `${paidRows.length} pagamentos em 60d`}</span></section>
      <section className="stat-card"><span className="stat-icon"><Compass size={18} /></span>
        <small>BUSCAS 30D</small><strong>{sumDays(searchesDates, 30)}</strong>
        <span className="stat-sub"><Delta now={search7} before={searchPrev7} /></span></section>
      <section className="stat-card"><span className="stat-icon"><TrendingUp size={18} /></span>
        <small>CRÉDITOS 30D</small><strong>{creditSum30}</strong>
        <span className="stat-sub">consumidos em operações concluídas</span></section>
      <section className="stat-card"><span className="stat-icon"><Headset size={18} /></span>
        <small>CHAMADOS ABERTOS</small><strong>{openTickets}</strong>
        <span className="stat-sub">{humanQueue} aguardando humano · {ticketByAtt.ia ?? 0} sob a IA</span></section>
    </div>

    <div className="adm-charts">
      <ChartCard title="NOVOS USUÁRIOS / DIA" hint="30 dias" data={daySeries(signDates)} />
      <ChartCard title="BUSCAS / DIA" hint="30 dias" data={daySeries(searchesDates)} />
      <ChartCard title="RECEITA / DIA" hint="30 dias" money data={daySum(
        paidRows.map((p) => ({ date: p.created_at as string, amount: p.amount_cents ?? 0 })),
      )} />
      <ChartCard title="CRÉDITOS / DIA" hint="30 dias" data={daySeries(creditDates)} />
    </div>

    <div className="dash-grid">
      <section className="dash-panel">
        <h2><Workflow size={16} /> Funil de leads</h2>
        {leadsTotal === 0
          ? <p className="dash-empty">Nenhum lead salvo ainda.</p>
          : <ul className="adm-dist">
              {LEAD_ORDER.map((s) => (
                <DistRow key={s} label={LEAD_STATUS_LABEL[s]} value={byStatus[s] ?? 0} max={maxLead} />
              ))}
            </ul>}
        <p className="adm-note">{leadsTotal} leads salvos · {byStatus.ganho ?? 0} ganhos · {byStatus.perdido ?? 0} perdidos</p>
      </section>
      <section className="dash-panel">
        <h2><CreditCard size={16} /> Assinaturas por plano</h2>
        {Object.keys(byPlan).length === 0
          ? <p className="dash-empty">Nenhuma assinatura ativa.</p>
          : <ul className="adm-dist">
              {Object.entries(byPlan).map(([slug, n]) => (
                <DistRow key={slug} label={slug} value={n} max={maxPlan} />
              ))}
            </ul>}
        <p className="adm-note">
          Períodos: {(subs ?? []).filter((s) => ((s as { billing_months?: number }).billing_months ?? 1) > 1).length} de longo prazo ·
          {" "}{(subs ?? []).filter((s) => ((s as { billing_months?: number }).billing_months ?? 1) === 1).length} mensais
        </p>
      </section>
      <section className="dash-panel">
        <h2><Radar size={16} /> Consumo por ação (60d)</h2>
        {porAcao.length === 0
          ? <p className="dash-empty">Nenhuma operação registrada ainda.</p>
          : <ul className="adm-dist">
              {porAcao.map(([action, total]) => (
                <DistRow key={action} label={ACTION_LABELS[action] ?? action} value={`${total} cr`} max={maxAcao} />
              ))}
            </ul>}
        <div className="dash-links">
          <Link href="/admin/planos" className="text-link">Editar cards de plano <ArrowUpRight size={13} /></Link>
          <Link href="/admin/financeiro" className="text-link">Financeiro <ArrowUpRight size={13} /></Link>
        </div>
      </section>
      <section className="dash-panel">
        <h2><Headset size={16} /> Suporte</h2>
        <ul className="adm-dist">
          {Object.entries(TICKET_STATUS_LABEL).map(([s, label]) => (
            <DistRow key={s} label={label} value={ticketByStatus[s] ?? 0} max={maxTicket} />
          ))}
        </ul>
        <p className="adm-note">
          <span className="ticket-ia">IA</span> conduz {ticketByAtt.ia ?? 0} chamado(s) ·
          humano conduz {ticketByAtt.admin ?? 0}
        </p>
        <div className="dash-links">
          <Link href="/admin/chamados" className="text-link">Abrir chamados <ArrowUpRight size={13} /></Link>
        </div>
      </section>
    </div>

    <div className="dash-grid">
      <section className="dash-panel">
        <h2><Layers size={16} /> Fila e artefatos</h2>
        <ul className="adm-dist">
          <DistRow label="Jobs de busca (running)" value={sj.running ?? 0} />
          <DistRow label="Jobs de busca (error)" value={sj.error ?? 0} />
          <DistRow label="Jobs de IA (running)" value={aj.running ?? 0} />
          <DistRow label="Jobs de IA (error)" value={aj.error ?? 0} />
          <DistRow label="Jobs travados &gt;10min" value={stuck} />
          <DistRow label="Sites publicados" value={sitesCount ?? 0} />
          <DistRow label="Domínios ativos/pagos" value={domainsCount ?? 0} />
          <DistRow label="Jobs na fila agora" value={runningJobs} />
        </ul>
        <div className="dash-links">
          <Link href="/admin/jobs" className="text-link">Jobs ao vivo <ArrowUpRight size={13} /></Link>
          <Link href="/admin/dominios" className="text-link">Domínios <ArrowUpRight size={13} /></Link>
          <Link href="/admin/usuarios" className="text-link">Usuários <ArrowUpRight size={13} /></Link>
          <Link href="/admin/integracoes" className="text-link">Integrações <ArrowUpRight size={13} /></Link>
        </div>
      </section>
      <section className="dash-panel">
        <h2><ReceiptText size={16} /> Últimos pagamentos</h2>
        {lastPayments.length === 0
          ? <p className="dash-empty">Nenhum pagamento em 60 dias.</p>
          : <ul className="adm-feed">
              {lastPayments.map((p, i) => (
                <li key={i} className="adm-feed-row">
                  <span className={`adm-tag adm-tag-${p.status}`}>{p.status}</span>
                  <span className="adm-mono">{brl(p.amount_cents ?? 0)}</span>
                  <span>{p.method ?? "?"} · {p.provider ?? "?"} · {(p.metadata as Record<string, unknown> | null)?.kind as string ?? "plan"}</span>
                  <small>{fmtHora(p.created_at)}</small>
                </li>
              ))}
            </ul>}
        <div className="dash-links">
          <Link href="/admin/financeiro" className="text-link">Financeiro completo <ArrowUpRight size={13} /></Link>
        </div>
      </section>
      <section className="dash-panel">
        <h2><ShieldCheck size={16} /> Auditoria recente</h2>
        {(audit ?? []).length === 0
          ? <p className="dash-empty">Sem eventos auditados.</p>
          : <ul className="adm-feed">
              {(audit ?? []).map((a, i) => (
                <li key={i} className="adm-feed-row">
                  <span className="adm-mono">{a.acao}</span>
                  <span>{a.alvo}</span>
                  <small title={JSON.stringify(a.diff)}>{fmtHora(a.created_at)}</small>
                </li>
              ))}
            </ul>}
      </section>
      <section className="dash-panel">
        <h2><Sparkles size={16} /> Console de testes</h2>
        <AdminTools />
      </section>
    </div>

    <section className="dash-panel">
      <h2><Settings2 size={16} /> Regras de créditos</h2>
      <AdminCreditos
        plans={plansData ?? []}
        rules={rules ?? []}
        welcome={settings?.welcome_credits ?? 0}
      />
    </section>

    <p className="private-disclaimer"><ShieldCheck size={13} /> Nenhuma chave secreta é exibida neste painel — só origem e estado.</p>
  </>;
}
