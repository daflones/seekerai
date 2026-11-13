import type { Metadata } from "next";
import {
  Banknote, CreditCard, Filter, ReceiptText, RefreshCcw,
  Target, TrendingUp, UserSearch, Wallet, CalendarClock,
} from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AdminFinanceiro } from "@/components/admin-financeiro";
import { AdminDiscount } from "@/components/admin-discount";
import { FinList } from "@/components/fin-list";
import {
  addCents, emptyTotals, fmtMoney, fmtTotals, payCurrency,
  type CurTotals, type PayCurrency,
} from "@/lib/admin/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Financeiro", robots: { index: false } };

const DAY = 24 * 60 * 60 * 1000;
const brl = (cents: number) => fmtMoney(cents, "brl");
// Totais por moeda em centavos — nunca soma moedas diferentes.
const curOf = (p: PayRow) => payCurrency(p);
const sumPaid = (rows: PayRow[]): CurTotals => {
  const t = emptyTotals();
  for (const p of rows) addCents(t, curOf(p), p.amount_cents);
  return t;
};
const subBaseCents = (s: { currency?: string | null; plans?: unknown; plano?: unknown }, fallback?: number): { cur: PayCurrency; cents: number } => {
  const raw = String(s.currency ?? "brl").toLowerCase();
  const cur: PayCurrency = raw === "usd" || raw === "eur" || raw === "gbp" ? raw : "brl";
  const plano = (s.plans ?? s.plano) as unknown as { preco_centavos?: number; intl_prices?: Record<string, number> } | null;
  const cents = cur === "brl"
    ? (plano?.preco_centavos ?? fallback ?? 0)
    : (plano?.intl_prices?.[cur] ?? 0);
  return { cur, cents };
};
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
  amount_cents: number; currency: string | null; metadata: unknown; created_at: string;
};

function kindOf(p: PayRow): string {
  const k = (p.metadata as Record<string, unknown> | null)?.kind;
  return typeof k === "string" ? k : "plan";
}

/** Sufixo "↑ upgrade Pro → King" quando o pagamento é troca de plano. */
function changeLabel(p: PayRow, toName: string, fromName?: string): string {
  const m = p.metadata as Record<string, unknown> | null;
  const chg = typeof m?.plan_change === "string" ? m.plan_change : null;
  if (!chg) return "";
  const from = typeof m?.from_plan === "string" && m.from_plan
    ? (fromName ?? m.from_plan) : null;
  const arrow = chg === "upgrade" ? "↑" : chg === "downgrade" ? "↓" : "⟳";
  const word = chg === "periodo" ? "mudou período" : chg;
  return ` ${arrow} ${word}${from ? ` ${from} → ${toName}` : ""}`;
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

function Delta({ now, before }: { now: CurTotals; before: CurTotals }) {
  const keys = (["brl", "usd", "eur", "gbp"] as const).filter((c) => now[c] !== 0 || before[c] !== 0);
  if (!keys.length) return null;
  return <>{keys.map((c) => {
    const diff = now[c] - before[c];
    if (diff === 0) return null;
    const cls = diff > 0 ? "adm-delta-up" : "adm-delta-down";
    const arrow = diff > 0 ? "↗" : "↘";
    return <span key={c} className={`adm-delta ${cls}`}>{arrow} {fmtMoney(Math.abs(diff), c)} {c.toUpperCase()} vs 30d</span>;
  })}</>;
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

function DistRow({ label, value, max }: { label: string; value: number | CurTotals | string; max: number }) {
  const n = typeof value === "object" ? value.brl : typeof value === "number" ? value : 0;
  const pct = Math.max(2, (n / Math.max(1, max)) * 100);
  const text = typeof value === "string" ? value : fmtTotals(typeof value === "object" ? value : { brl: value, usd: 0, eur: 0, gbp: 0 });
  return (
    <li className="adm-dist-row">
      <span className="adm-dist-label">{label}</span>
      <span className="adm-dist-track"><span className="adm-dist-fill" style={{ width: `${pct}%` }} /></span>
      <strong>{text}</strong>
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
    { data: discSetting },
  ] = await Promise.all([
    supabase.from("payments")
      .select("id,user_id,plan_id,status,provider,method,amount_cents,currency,metadata,created_at")
      .order("created_at", { ascending: false }).limit(3000),
    supabase.from("subscriptions")
      .select("status,billing_months,currency,current_period_end,provider,user_id, plans(slug,nome,preco_centavos,intl_prices)")
      .eq("status", "active"),
    supabase.from("plans").select("id,slug,nome,preco_centavos").eq("ativo", true),
    supabase.from("app_settings").select("value").eq("key", "first_purchase_discount_pct").maybeSingle(),
  ]);
  const discountPct = Math.min(90, Math.max(0, Math.trunc(Number(discSetting?.value ?? 0)) || 0));

  const pays = (payments ?? []) as PayRow[];
  const now = Date.now();
  const paid = pays.filter((p) => p.status === "paid");
  const inWin = (iso: string, days: number) => new Date(iso).getTime() > now - days * DAY;
  const inPrev = (iso: string, days: number) => {
    const t = new Date(iso).getTime();
    return t <= now - days * DAY && t > now - 2 * days * DAY;
  };

  // KPIs — cada moeda soma na sua própria chave (nada de dólar virando real).
  const gross = sumPaid(paid);
  const paid30 = paid.filter((p) => inWin(p.created_at, 30));
  const totals30 = sumPaid(paid30);
  const totalsPrev30 = sumPaid(paid.filter((p) => inPrev(p.created_at, 30)));
  const totals7 = sumPaid(paid.filter((p) => inWin(p.created_at, 7)));
  const countByCur = paid30.reduce<Partial<Record<PayCurrency, number>>>((acc, p) => {
    const c = curOf(p); acc[c] = (acc[c] ?? 0) + 1; return acc;
  }, {});
  const ticket30 = emptyTotals();
  for (const c of ["brl", "usd", "eur", "gbp"] as const) {
    const n = countByCur[c] ?? 0;
    if (n) ticket30[c] = Math.round(totals30[c] / n);
  }

  // MRR/ARR por moeda — mensalidade equivalente na moeda da assinatura
  // (anual -20%, trimestral -10%), preço intl do plano quando não é BRL.
  const mrr = emptyTotals();
  for (const s of subs ?? []) {
    const { cur, cents } = subBaseCents(s as { currency?: string | null; plans?: unknown });
    const months = Number((s as { billing_months?: number }).billing_months) || 1;
    const factor = months === 12 ? 0.8 : months === 3 ? 0.9 : 1;
    addCents(mrr, cur, Math.round(cents * factor));
  }

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

  // Última conversão por usuário: qualquer pagamento "paid" dele.
  const lastPaidAt = new Map<string, string>();
  for (const p of pays) {
    if (p.user_id && p.status === "paid" && !lastPaidAt.has(p.user_id)) {
      lastPaidAt.set(p.user_id, p.created_at);
    }
  }
  // Última atividade de pagamento por usuário (qualquer status) — pays já vem desc.
  const lastAnyAt = new Map<string, string>();
  for (const p of pays) {
    if (p.user_id && !lastAnyAt.has(p.user_id)) lastAnyAt.set(p.user_id, p.created_at);
  }

  // Distribuições (valores pagos) — CurTotals por moeda.
  const planName = new Map((plansData ?? []).map((pl) => [pl.id, pl.nome]));
  const planNameBySlug = new Map((plansData ?? []).map((pl) => [pl.slug, pl.nome]));
  const accCur = () => emptyTotals();
  const bump = (map: Record<string, CurTotals>, key: string, p: PayRow) => {
    map[key] = map[key] ?? accCur();
    addCents(map[key], curOf(p), p.amount_cents);
  };
  const byKindMap: Record<string, CurTotals> = {};
  const byMethodMap: Record<string, CurTotals> = {};
  const byProviderMap: Record<string, CurTotals> = {};
  const byPlanMap: Record<string, CurTotals> = {};
  for (const p of paid) {
    bump(byKindMap, kindOf(p), p);
    bump(byMethodMap, p.method ?? "?", p);
    bump(byProviderMap, p.provider ?? "?", p);
    const k = kindOf(p);
    const label = k === "plan"
      ? String(planName.get(p.plan_id ?? "") ?? "Plano")
      : (KIND_LABEL[k] ?? k);
    bump(byPlanMap, label, p);
  }
  const sortCur = (m: Record<string, CurTotals>) =>
    Object.entries(m).sort((a, b) =>
      (b[1].brl + b[1].usd + b[1].eur + b[1].gbp) - (a[1].brl + a[1].usd + a[1].eur + a[1].gbp));
  const byKind = sortCur(byKindMap);
  const byMethod = sortCur(byMethodMap);
  const byProvider = sortCur(byProviderMap);
  const byPlan = sortCur(byPlanMap);
  const sizeOf = (t: CurTotals) => t.brl + t.usd + t.eur + t.gbp;
  const distMax = Math.max(1, ...byKind.map(([, v]) => sizeOf(v)), ...byMethod.map(([, v]) => sizeOf(v)),
    ...byProvider.map(([, v]) => sizeOf(v)), ...byPlan.map(([, v]) => sizeOf(v)));
  const statusMax = Math.max(1, ...Object.values(statusCount));

  // Série de receita 30d — o gráfico soma em BRL (moedas não se misturam);
  // pagamentos USD/EUR/GBP aparecem nas distribuições e totais por moeda.
  const revSeries = daySum(
    paid.filter((p) => curOf(p) === "brl").map((p) => ({ date: p.created_at, amount: p.amount_cents })), 30,
  );

  // Nomes: últimos pagamentos + assinaturas + follow-ups
  const lastPayments = pays.slice(0, 200);
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
      .slice(0, 25);
  })();

  const nameIds = new Set<string>();
  lastPayments.forEach((p) => p.user_id && nameIds.add(p.user_id));
  followUps.forEach((f) => nameIds.add(f.uid));
  (subs ?? []).forEach((s) => s.user_id && nameIds.add(s.user_id));
  // Busca perfis em lotes pra não estourar o limite de URL do PostgREST.
  const idChunks: string[][] = [];
  const allIds = [...nameIds];
  for (let i = 0; i < allIds.length; i += 80) idChunks.push(allIds.slice(i, i + 80));
  const [{ data: profs }, authUsers] = await Promise.all([
    idChunks.length
      ? Promise.all(idChunks.map((ids) =>
          supabase.from("profiles").select("id,nome").in("id", ids),
        )).then((rs) => ({ data: rs.flatMap((r) => r.data ?? []) }))
      : Promise.resolve({ data: [] as { id: string; nome: string | null }[] }),
    nameIds.size
      ? createSupabaseAdminClient().auth.admin.listUsers({ perPage: 1000 })
      : Promise.resolve({ data: { users: [] as { id: string; email?: string }[] } }),
  ]);
  const emailById = new Map((authUsers.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const userName = new Map((profs ?? []).map((u) => [u.id, u.nome || emailById.get(u.id) || "—"]));

  const subsRows = (subs ?? [])
    .map((s) => ({
      ...s,
      plano: s.plans as unknown as { nome: string; preco_centavos: number; intl_prices?: Record<string, number> } | null,
    }))
    .sort((a, b) => String(a.current_period_end ?? "").localeCompare(String(b.current_period_end ?? "")));

  return <>
    <span className="eyebrow">FINANCEIRO</span>
    <h1>Centro financeiro<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Receita, conversão de pagamento, assinaturas, follow-up de quem não concluiu
      e saque PIX do saldo MercosulPay.
    </p>

    <AdminFinanceiro />

    <div className="stat-grid">
      <section className="stat-card fin-saldo">
        <span className="stat-icon"><Banknote size={18} /></span>
        <small>RECEITA TOTAL</small>
        <strong>{fmtTotals(gross)}</strong>
        <span className="stat-sub">{paid.length} pagamentos confirmados</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><TrendingUp size={18} /></span>
        <small>RECEITA 30D</small>
        <strong>{fmtTotals(totals30)}</strong>
        <Delta now={totals30} before={totalsPrev30} />
      </section>
      <section className="stat-card">
        <span className="stat-icon"><ReceiptText size={18} /></span>
        <small>RECEITA 7D</small>
        <strong>{fmtTotals(totals7)}</strong>
        <span className="stat-sub">{paid.filter((p) => inWin(p.created_at, 7)).length} vendas na semana</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><RefreshCcw size={18} /></span>
        <small>MRR → ARR</small>
        <strong>{fmtTotals(mrr)}</strong>
        <span className="stat-sub">ARR ≈ {fmtTotals({ brl: mrr.brl * 12, usd: mrr.usd * 12, eur: mrr.eur * 12, gbp: mrr.gbp * 12 })} · {subsRows.length} assinaturas</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><CreditCard size={18} /></span>
        <small>TICKET MÉDIO 30D</small>
        <strong>{fmtTotals(ticket30)}</strong>
        <span className="stat-sub">por pagamento confirmado, em cada moeda</span>
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
        <small>RECEITA POR DIA · 30 DIAS · SOMENTE R$</small>
        <strong>{fmtTotals(totals30)}</strong>
      </div>
      <Bars data={revSeries} />
      <div className="adm-chart-foot"><span>{revSeries[0]?.label}</span><span>passa o mouse pra ver o dia</span><span>{revSeries[29]?.label}</span></div>
    </section>

    <AdminDiscount initialPct={discountPct} />

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
        <p className="dash-hint">Gente com intenção de compra travada — follow-up direto fecha venda.
          Pendente = QR aberto · Expirado = trocou de cobrança ou QR venceu · Falhou = erro ao gerar.</p>
        {followUps.length === 0
          ? <p className="dash-empty">Nenhuma tentativa pendente/expirada.</p>
          : <FinList className="adm-feed" pageSize={8}>
              {followUps.map(({ uid, rows }) => {
                const last = rows[0];
                const meta = (last.metadata ?? {}) as Record<string, unknown>;
                const periodo = typeof meta.period === "string" ? meta.period : null;
                const oQue = `${KIND_LABEL[kindOf(last)] ?? kindOf(last)}${periodo ? ` ${periodo}` : ""}`
                  + changeLabel(last,
                      planName.get(last.plan_id ?? "") ?? "Plano",
                      planNameBySlug.get(String(meta.from_plan ?? "")));
                const converted = (lastPaidAt.get(uid) ?? "") > last.created_at;
                const hasNewer = (lastAnyAt.get(uid) ?? "") > last.created_at;
                const motivo = converted
                  ? "✅ pagou depois — não é lead frio"
                  : last.status === "pending"
                    ? "QR gerado, ainda aguardando pagamento"
                    : last.status === "expired"
                      ? (hasNewer ? "trocou de cobrança — gerou outra em seguida" : "cobrança expirou sem pagar")
                      : "falha ao gerar a cobrança";
                const email = emailById.get(uid);
                return (
                  <li key={uid} className="adm-feed-row">
                    <span className={`adm-tag adm-tag-${converted ? "paid" : last.status}`}>{converted ? "paid" : last.status}</span>
                    <span>
                      <strong>{userName.get(uid) ?? "—"}</strong>
                      {email && email !== userName.get(uid) ? <small className="fin-follow-mail"> {email}</small> : null}
                      <br />
                      <small>
                        {rows.length} tentativa{rows.length > 1 ? "s" : ""} · última: {oQue} · {fmtMoney(last.amount_cents, curOf(last))} via {last.method ?? "?"} — <em>{motivo}</em>
                      </small>
                    </span>
                    <small title={last.created_at}>{fmtHora(last.created_at)}</small>
                  </li>
                );
              })}
            </FinList>}
      </section>
    </div>

    <section className="dash-panel">
      <h2><CalendarClock size={16} /> Assinaturas ativas · próximas renovações</h2>
      {subsRows.length === 0
        ? <p className="dash-empty">Nenhuma assinatura ativa.</p>
        : <FinList className="adm-feed" pageSize={15}>
            {subsRows.map((s, i) => (
              <li key={i} className="adm-feed-row">
                <span className="adm-tag adm-tag-paid">{s.provider}</span>
                <span><strong>{userName.get(s.user_id) ?? "—"}</strong> · {s.plano?.nome ?? "Plano"} · {s.billing_months === 12 ? "anual" : s.billing_months === 3 ? "trimestral" : "mensal"} · {(() => { const { cur, cents } = subBaseCents(s); return cents ? fmtMoney(cents, cur) : "—"; })()}</span>
                <small title={String(s.current_period_end ?? "")}>renova {s.current_period_end ? fmtDia(s.current_period_end) : "—"}</small>
              </li>
            ))}
          </FinList>}
    </section>

    <section className="dash-panel">
      <h2><ReceiptText size={16} /> Todos os pagamentos</h2>
      {lastPayments.length === 0
        ? <p className="dash-empty">Nenhum pagamento registrado.</p>
        : <FinList className="adm-feed" pageSize={20}>
            {lastPayments.map((p) => (
              <li key={p.id} className="adm-feed-row">
                <span className={`adm-tag adm-tag-${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                <span className="adm-mono">{fmtMoney(p.amount_cents, curOf(p))}</span>
                <span title={String(p.user_id ?? "")}>
                  <strong>{userName.get(p.user_id ?? "") ?? "—"}</strong>
                  {" · "}{p.method ?? "?"} · {p.provider ?? "?"} · {KIND_LABEL[kindOf(p)] ?? kindOf(p)}
                  <em>{changeLabel(p,
                    planName.get(p.plan_id ?? "") ?? "Plano",
                    planNameBySlug.get(String((p.metadata as Record<string, unknown> | null)?.from_plan ?? "")))}</em>
                </span>
                <small>{fmtHora(p.created_at)}</small>
              </li>
            ))}
          </FinList>}
    </section>
  </>;
}
