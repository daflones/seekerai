import type { Metadata } from "next";
import {
  Banknote, CreditCard, Filter, ReceiptText, RefreshCcw,
  Target, TrendingUp, UserSearch, Wallet, CalendarClock,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { AdminFinanceiro } from "@/components/admin-financeiro";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Financeiro", robots: { index: false } };

const DAY = 24 * 60 * 60 * 1000;
const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", {
  day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo",
});

const KIND_LABEL: Record<string, string> = {
  plan: "Plano", credit_pack: "Pacote de créditos", domain: "Domínio",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Pago", pending: "Pendente", expired: "Expirado",
  refunded: "Reembolsado", failed: "Falhou", manual_review: "Revisão",
};

type PayRow = {
  id: string; user_id: string | null; plan_id: string | null;
  status: string; provider: string | null; method: string | null;
  amount_cents: number; metadata: unknown; created_at: string;
};

function kindOf(p: PayRow): string {
  const k = (p.metadata as Record<string, unknown> | null)?.kind;
  return typeof k === "string" ? k : "plan";
}

function daySum(pairs: { date: string; amount: number }[], days: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
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

function Delta({ now, before }: { now: number; before: number }) {
  if (now === 0 && before === 0) return null;
  const diff = now - before;
  const cls = diff > 0 ? "adm-delta-up" : diff < 0 ? "adm-delta-down" : "adm-delta-flat";
  const arrow = diff > 0 ? "↗" : diff < 0 ? "↘" : "→";
  return <span className={`adm-delta ${cls}`}>{arrow} {brl(Math.abs(diff))} vs 30d anterior</span>;
}

function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="adm-bars" role="img">
      {data.map((d, i) => (
        <span key={i} className="adm-bar-wrap" title={`${d.label}: ${brl(d.value)}`}>
          <span className="adm-bar" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function DistRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(2, (value / Math.max(1, max)) * 100);
  return (
    <li className="adm-dist-row">
      <span className="adm-dist-label">{label}</span>
      <span className="adm-dist-track"><span className="adm-dist-fill" style={{ width: `${pct}%` }} /></span>
      <strong>{brl(value)}</strong>
    </li>
  );
}

function CountRow({ label, value, max, extra }: { label: string; value: number; max: number; extra?: string }) {
  const pct = Math.max(2, (value / Math.max(1, max)) * 100);
  return (
    <li className="adm-dist-row">
      <span className="adm-dist-label">{label}</span>
      <span className="adm-dist-track"><span className="adm-dist-fill" style={{ width: `${pct}%` }} /></span>
      <strong>{value}{extra ? <small className="fin-count-extra"> {extra}</small> : null}</strong>
    </li>
  );
}

export default async function AdminFinanceiroPage() {
  const { supabase } = await requireSession("/admin/financeiro", { admin: true });

  const [
    { data: payments },
    { data: subs },
    { data: plansData },
  ] = await Promise.all([
    supabase.from("payments")
      .select("id,user_id,plan_id,status,provider,method,amount_cents,metadata,created_at")
      .order("created_at", { ascending: false }).limit(3000),
    supabase.from("subscriptions")
      .select("status,billing_months,current_period_end,provider,user_id, plans(slug,nome,preco_centavos)")
      .eq("status", "active"),
    supabase.from("plans").select("id,slug,nome,preco_centavos").eq("ativo", true),
  ]);

  const pays = (payments ?? []) as PayRow[];
  const now = Date.now();
  const paid = pays.filter((p) => p.status === "paid");
  const inWin = (iso: string, days: number) => new Date(iso).getTime() > now - days * DAY;
  const inPrev = (iso: string, days: number) => {
    const t = new Date(iso).getTime();
    return t <= now - days * DAY && t > now - 2 * days * DAY;
  };

  // KPIs
  const gross = paid.reduce((a, p) => a + p.amount_cents, 0);
  const paid30 = paid.filter((p) => inWin(p.created_at, 30));
  const cents30 = paid30.reduce((a, p) => a + p.amount_cents, 0);
  const centsPrev30 = paid.filter((p) => inPrev(p.created_at, 30)).reduce((a, p) => a + p.amount_cents, 0);
  const cents7 = paid.filter((p) => inWin(p.created_at, 7)).reduce((a, p) => a + p.amount_cents, 0);
  const ticket30 = paid30.length ? Math.round(cents30 / paid30.length) : 0;

  // MRR/ARR — mesma normalização do dashboard (anual -20%, trimestral -10%).
  const mrr = (subs ?? []).reduce((acc, s) => {
    const plano = s.plans as unknown as { preco_centavos: number } | null;
    const months = s.billing_months ?? 1;
    return acc + (plano ? plano.preco_centavos * (months === 12 ? 0.8 : months === 3 ? 0.9 : 1) : 0);
  }, 0);

  // Funil de conversão de pagamento
  const statusCount = pays.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  const closed = (statusCount.paid ?? 0) + (statusCount.expired ?? 0)
    + (statusCount.refunded ?? 0) + (statusCount.failed ?? 0);
  const convRate = closed ? Math.round(((statusCount.paid ?? 0) / closed) * 100) : 0;
  const convPix = (() => {
    const rows = pays.filter((p) => p.method === "pix" && ["paid", "expired", "failed"].includes(p.status));
    const ok = rows.filter((p) => p.status === "paid").length;
    return rows.length ? Math.round((ok / rows.length) * 100) : 0;
  })();
  const convCard = (() => {
    const rows = pays.filter((p) => p.method === "card" && ["paid", "expired", "failed"].includes(p.status));
    const ok = rows.filter((p) => p.status === "paid").length;
    return rows.length ? Math.round((ok / rows.length) * 100) : 0;
  })();

  // Distribuições (valores pagos)
  const byKind = Object.entries(paid.reduce<Record<string, number>>((acc, p) => {
    acc[kindOf(p)] = (acc[kindOf(p)] ?? 0) + p.amount_cents;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const byMethod = Object.entries(paid.reduce<Record<string, number>>((acc, p) => {
    acc[p.method ?? "?"] = (acc[p.method ?? "?"] ?? 0) + p.amount_cents;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const byProvider = Object.entries(paid.reduce<Record<string, number>>((acc, p) => {
    acc[p.provider ?? "?"] = (acc[p.provider ?? "?"] ?? 0) + p.amount_cents;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);

  const planName = new Map((plansData ?? []).map((pl) => [pl.id, pl.nome]));
  const byPlan = Object.entries(paid.reduce<Record<string, number>>((acc, p) => {
    const k = kindOf(p);
    const label = k === "plan"
      ? String(planName.get(p.plan_id ?? "") ?? "Plano")
      : (KIND_LABEL[k] ?? k);
    acc[label] = (acc[label] ?? 0) + p.amount_cents;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const distMax = Math.max(1, ...byKind.map(([, v]) => v), ...byMethod.map(([, v]) => v),
    ...byProvider.map(([, v]) => v), ...byPlan.map(([, v]) => v));
  const statusMax = Math.max(1, ...Object.values(statusCount));

  // Série de receita 30d
  const revSeries = daySum(
    paid.map((p) => ({ date: p.created_at, amount: p.amount_cents })), 30,
  );

  // Nomes: últimos 50 pagamentos + assinaturas + follow-ups
  const lastPayments = pays.slice(0, 50);
  const followUps = (() => {
    const recent = pays.filter((p) => ["pending", "expired", "failed"].includes(p.status)
      && inWin(p.created_at, 14));
    const byUser = new Map<string, PayRow[]>();
    for (const p of recent) {
      if (!p.user_id) continue;
      byUser.set(p.user_id, [...(byUser.get(p.user_id) ?? []), p]);
    }
    return [...byUser.entries()]
      .map(([uid, rows]) => ({ uid, rows: rows.sort((a, b) => b.created_at.localeCompare(a.created_at)) }))
      .sort((a, b) => b.rows[0].created_at.localeCompare(a.rows[0].created_at))
      .slice(0, 10);
  })();

  const nameIds = new Set<string>();
  lastPayments.forEach((p) => p.user_id && nameIds.add(p.user_id));
  followUps.forEach((f) => nameIds.add(f.uid));
  (subs ?? []).forEach((s) => s.user_id && nameIds.add(s.user_id));
  const { data: profs } = nameIds.size
    ? await supabase.from("profiles").select("id,nome,email").in("id", [...nameIds])
    : { data: [] as { id: string; nome: string | null; email: string | null }[] };
  const userName = new Map((profs ?? []).map((u) => [u.id, u.nome || u.email || "—"]));

  const subsRows = (subs ?? [])
    .map((s) => ({
      ...s,
      plano: s.plans as unknown as { nome: string; preco_centavos: number } | null,
    }))
    .sort((a, b) => String(a.current_period_end ?? "").localeCompare(String(b.current_period_end ?? "")));

  return <>
    <span className="eyebrow">FINANCEIRO</span>
    <h1>Centro financeiro<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Receita, conversão de pagamento, assinaturas, follow-up de quem não concluiu
      e saque PIX do saldo MercosulPay.
    </p>

    <div className="stat-grid">
      <section className="stat-card fin-saldo">
        <span className="stat-icon"><Banknote size={18} /></span>
        <small>RECEITA TOTAL</small>
        <strong>{brl(gross)}</strong>
        <span className="stat-sub">{paid.length} pagamentos confirmados</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><TrendingUp size={18} /></span>
        <small>RECEITA 30D</small>
        <strong>{brl(cents30)}</strong>
        <Delta now={cents30} before={centsPrev30} />
      </section>
      <section className="stat-card">
        <span className="stat-icon"><ReceiptText size={18} /></span>
        <small>RECEITA 7D</small>
        <strong>{brl(cents7)}</strong>
        <span className="stat-sub">{paid.filter((p) => inWin(p.created_at, 7)).length} vendas na semana</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><RefreshCcw size={18} /></span>
        <small>MRR → ARR</small>
        <strong>{brl(mrr)}</strong>
        <span className="stat-sub">ARR ≈ {brl(mrr * 12)} · {subsRows.length} assinaturas</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><CreditCard size={18} /></span>
        <small>TICKET MÉDIO 30D</small>
        <strong>{brl(ticket30)}</strong>
        <span className="stat-sub">por pagamento confirmado</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><Target size={18} /></span>
        <small>CONVERSÃO DE PAGAMENTO</small>
        <strong>{convRate}%</strong>
        <span className="stat-sub">PIX {convPix}% · Cartão {convCard}%</span>
      </section>
    </div>

    <section className="adm-chart fin-rev-chart">
      <div className="adm-chart-head">
        <small>RECEITA POR DIA · 30 DIAS</small>
        <strong>{brl(cents30)}</strong>
      </div>
      <Bars data={revSeries} />
      <div className="adm-chart-foot"><span>{revSeries[0]?.label}</span><span>passa o mouse pra ver o dia</span><span>{revSeries[29]?.label}</span></div>
    </section>

    <div className="dash-grid">
      <section className="dash-panel">
        <h2><Filter size={16} /> Funil de pagamento</h2>
        <p className="dash-hint">Toda cobrança criada vs confirmada.</p>
        <ul className="adm-dist">
          {["paid", "pending", "expired", "refunded", "failed", "manual_review"]
            .filter((s) => statusCount[s])
            .map((s) => (
              <CountRow key={s} label={STATUS_LABEL[s] ?? s} value={statusCount[s]} max={statusMax}
                extra={s === "paid" && closed ? `${convRate}%` : undefined} />
            ))}
        </ul>
        <p className="dash-hint" style={{ marginTop: 10 }}>
          Conversão: <strong className="adm-mono">{convRate}%</strong> das cobranças encerradas viraram receita.
          PIX confirma {convPix}% · Cartão {convCard}%.
        </p>
      </section>

      <section className="dash-panel">
        <h2><ReceiptText size={16} /> Receita por tipo</h2>
        <ul className="adm-dist">
          {byKind.map(([k, v]) => (
            <DistRow key={k} label={KIND_LABEL[k] ?? k} value={v} max={distMax} />
          ))}
        </ul>
        <h2 style={{ marginTop: 16 }}><CreditCard size={16} /> Por método e provedor</h2>
        <ul className="adm-dist">
          {byMethod.map(([m, v]) => <DistRow key={m} label={m === "pix" ? "PIX" : m === "card" ? "Cartão" : m} value={v} max={distMax} />)}
          {byProvider.map(([p, v]) => <DistRow key={p} label={p} value={v} max={distMax} />)}
        </ul>
      </section>

      <section className="dash-panel">
        <h2><Wallet size={16} /> Receita por plano</h2>
        <ul className="adm-dist">
          {byPlan.map(([p, v]) => <DistRow key={p} label={p} value={v} max={distMax} />)}
        </ul>
      </section>

      <section className="dash-panel">
        <h2><UserSearch size={16} /> Tentou e não concluiu · 14d</h2>
        <p className="dash-hint">Gente com intenção de compra travada — follow-up direto fecha venda.</p>
        {followUps.length === 0
          ? <p className="dash-empty">Nenhuma tentativa pendente/expirada.</p>
          : <ul className="adm-feed">
              {followUps.map(({ uid, rows }) => {
                const last = rows[0];
                return (
                  <li key={uid} className="adm-feed-row">
                    <span className={`adm-tag adm-tag-${last.status}`}>{last.status}</span>
                    <span><strong>{userName.get(uid) ?? "—"}</strong> · {rows.length} tentativa{rows.length > 1 ? "s" : ""} · {brl(last.amount_cents)} via {last.method ?? "?"}</span>
                    <small title={last.created_at}>{fmtHora(last.created_at)}</small>
                  </li>
                );
              })}
            </ul>}
      </section>
    </div>

    <section className="dash-panel">
      <h2><CalendarClock size={16} /> Assinaturas ativas · próximas renovações</h2>
      {subsRows.length === 0
        ? <p className="dash-empty">Nenhuma assinatura ativa.</p>
        : <ul className="adm-feed">
            {subsRows.map((s, i) => (
              <li key={i} className="adm-feed-row">
                <span className="adm-tag adm-tag-paid">{s.provider}</span>
                <span><strong>{userName.get(s.user_id) ?? "—"}</strong> · {s.plano?.nome ?? "Plano"} · {s.billing_months === 12 ? "anual" : s.billing_months === 3 ? "trimestral" : "mensal"} · {s.plano ? brl(s.plano.preco_centavos) : "—"}</span>
                <small title={String(s.current_period_end ?? "")}>renova {s.current_period_end ? fmtDia(s.current_period_end) : "—"}</small>
              </li>
            ))}
          </ul>}
    </section>

    <section className="dash-panel">
      <h2><ReceiptText size={16} /> Todos os pagamentos</h2>
      {lastPayments.length === 0
        ? <p className="dash-empty">Nenhum pagamento registrado.</p>
        : <ul className="adm-feed">
            {lastPayments.map((p) => (
              <li key={p.id} className="adm-feed-row">
                <span className={`adm-tag adm-tag-${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                <span className="adm-mono">{brl(p.amount_cents)}</span>
                <span title={String(p.user_id ?? "")}>
                  <strong>{userName.get(p.user_id ?? "") ?? "—"}</strong>
                  {" · "}{p.method ?? "?"} · {p.provider ?? "?"} · {KIND_LABEL[kindOf(p)] ?? kindOf(p)}
                </span>
                <small>{fmtHora(p.created_at)}</small>
              </li>
            ))}
          </ul>}
    </section>

    <AdminFinanceiro />
  </>;
}
