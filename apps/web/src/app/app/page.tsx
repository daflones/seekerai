import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CircleDollarSign, Compass, Images, Radar, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getLocale, formatMoney } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export default async function AppPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [params, loc, { supabase, user, profile }] = await Promise.all([
    searchParams, getLocale(), requireSession(),
  ]);
  if (!profile.onboarding_visto_em) redirect("/boas-vindas");

  const t = getMessages(loc.lang).dash;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Cota diária de quem nunca pagou: completa até 13 antes de exibir.
  await supabase.rpc("claim_daily_credits");
  const [{ data: wallet }, { count: leadsTotal }, { count: leadsNovos }, { data: subs }, { data: ops }, { data: wonLeads }] = await Promise.all([
    supabase.from("credit_wallets").select("saldo").eq("user_id", user.id).maybeSingle(),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "novo"),
    supabase.from("subscriptions").select("status").eq("user_id", user.id)
      .in("status", ["active", "past_due"]).limit(1),
    supabase.from("credit_operations").select("action,cost,status,created_at")
      .eq("status", "completed").order("created_at", { ascending: false }).limit(30),
    supabase.from("leads").select("id,nome,valor_fechado,updated_at")
      .eq("status", "ganho").order("updated_at", { ascending: false }).limit(20),
  ]);

  type Op = { action: string; cost: number; status: string; created_at: string };
  const operacoes = (ops ?? []) as Op[];
  const buscas = operacoes.filter((o) => o.action === "search").length;
  const gastoMes = operacoes.filter((o) => new Date(o.created_at) >= monthStart)
    .reduce((acc, o) => acc + o.cost, 0);
  const porAcao = Object.entries(
    operacoes.reduce<Record<string, number>>((acc, o) => {
      acc[o.action] = (acc[o.action] ?? 0) + o.cost;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const assinatura = subs?.length ? "ativa" : null;
  const dateLocale = { pt: "pt-BR", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT" }[loc.lang];
  type WonLead = { id: string; nome: string; valor_fechado: number | null; updated_at: string };
  const ganhos = (wonLeads ?? []) as WonLead[];
  const totalFechado = ganhos.reduce((acc, l) => acc + (l.valor_fechado ?? 0), 0);

  return <>
    {params.checkout === "sucesso" && (
      <p className="shell-notice" role="status">{t.success}</p>
    )}
    <span className="eyebrow">{t.eyebrow}</span>
    <h1>{t.welcome}, {profile.nome || t.welcomeFallback}<span className="gradient-text">.</span></h1>
    <p className="private-intro">{t.intro}</p>

    <div className="stat-grid">
      <section className="stat-card">
        <span className="stat-icon"><CircleDollarSign size={18} /></span>
        <small>{t.s1l}</small>
        <strong>{wallet?.saldo ?? 0}</strong>
        <span className="stat-sub">{assinatura ? t.s1subOn : t.s1subOff}</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><Users size={18} /></span>
        <small>{t.s2l}</small>
        <strong>{leadsTotal ?? 0}</strong>
        <span className="stat-sub">{leadsNovos ? `${leadsNovos} ${t.s2subNew}` : t.s2subNone}</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><Radar size={18} /></span>
        <small>{t.s3l}</small>
        <strong>{buscas}</strong>
        <span className="stat-sub">{t.s3sub}</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><TrendingUp size={18} /></span>
        <small>{t.s4l}</small>
        <strong>{gastoMes}</strong>
        <span className="stat-sub">{t.s4sub}</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><CircleDollarSign size={18} /></span>
        <small>{t.s5l}</small>
        <strong>{formatMoney(Math.round(totalFechado * 100), loc.currency, loc.lang)}</strong>
        <span className="stat-sub">{t.s5sub} · {ganhos.length}</span>
      </section>
    </div>

    <section className="dash-panel">
      <h2><CircleDollarSign size={16} /> {t.wonTitle}</h2>
      {ganhos.length === 0
        ? <p className="dash-empty">{t.wonEmpty}</p>
        : <ul className="dash-usage">
            {ganhos.map((l) => (
              <li key={l.id}>
                <span><Link className="text-link" href={`/app/leads/${l.id}`}>{l.nome}</Link></span>
                <strong>{l.valor_fechado != null ? formatMoney(Math.round(l.valor_fechado * 100), loc.currency, loc.lang) : "—"}</strong>
              </li>
            ))}
          </ul>}
    </section>

    <div className="dash-grid">
      <section className="dash-panel">
        <h2><Sparkles size={16} /> {t.opsTitle}</h2>
        {porAcao.length === 0
          ? <p className="dash-empty">{t.opsEmpty}</p>
          : <>
              <ul className="dash-usage">
                {porAcao.map(([action, total]) => (
                  <li key={action}>
                    <span>{t.actionLabels[action] ?? action}</span>
                    <strong>{total} {total === 1 ? t.credit : t.credits}</strong>
                  </li>
                ))}
              </ul>
              <ul className="dash-ops">
                {operacoes.slice(0, 6).map((o, i) => (
                  <li key={`${o.created_at}-${i}`}>
                    <span>{t.actionLabels[o.action] ?? o.action}</span>
                    <span className="dash-op-meta">
                      {o.cost} cr · {t.statusLabels[o.status] ?? o.status} · {new Date(o.created_at).toLocaleDateString(dateLocale, { timeZone: "America/Sao_Paulo" })}
                    </span>
                  </li>
                ))}
              </ul>
            </>}
      </section>

      <section className="dash-panel">
        <h2><Compass size={16} /> {t.nextTitle}</h2>
        <ul className="dash-actions">
          <li><Link href="/app/buscar"><Radar size={16} /><div><strong>{t.n1t}</strong><small>{t.n1s}</small></div><ArrowUpRight size={15} /></Link></li>
          <li><Link href="/app/leads"><Users size={16} /><div><strong>{t.n2t}</strong><small>{t.n2s}</small></div><ArrowUpRight size={15} /></Link></li>
          <li><Link href="/app/portfolio"><Images size={16} /><div><strong>{t.n3t}</strong><small>{t.n3s}</small></div><ArrowUpRight size={15} /></Link></li>
          {!assinatura && <li><Link href="/app/planos"><CircleDollarSign size={16} /><div><strong>{t.n4t}</strong><small>{t.n4s}</small></div><ArrowUpRight size={15} /></Link></li>}
        </ul>
      </section>
    </div>

    <p className="private-disclaimer">
      <ShieldCheck size={13} /> {t.disc}
    </p>
  </>;
}
