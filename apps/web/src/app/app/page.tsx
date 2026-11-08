import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CircleDollarSign, Compass, Images, Radar, ShieldCheck, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getLocale, formatMoney } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { AnimatedNumber } from "@/components/animated-number";
import { DashNotifications } from "@/components/dash-notifications";

export default async function AppPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [params, loc, { supabase, user, profile }] = await Promise.all([
    searchParams, getLocale(), requireSession(),
  ]);
  if (!profile.onboarding_visto_em) redirect("/boas-vindas");

  const t = getMessages(loc.lang).dash;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Cota diária de quem não tem plano: completa até 13 dentro da
  // janela de 7 dias. 'ativo' diz se a renovação ainda está valendo.
  const { data: daily } = await supabase.rpc("claim_daily_credits");
  const dailyActive = (daily as { ativo?: boolean } | null)?.ativo !== false;
  const [{ data: wallet }, { count: leadsTotal }, { count: leadsNovos }, { data: subs }, { data: ops }, { data: wonLeads }, { data: allWon }, { data: notifs }] = await Promise.all([
    supabase.from("credit_wallets").select("saldo").eq("user_id", user.id).maybeSingle(),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "novo"),
    supabase.from("subscriptions").select("status").eq("user_id", user.id)
      .in("status", ["active", "past_due"]).limit(1),
    supabase.from("credit_operations").select("action,cost,status,created_at")
      .eq("status", "completed").order("created_at", { ascending: false }).limit(30),
    supabase.from("leads").select("id,nome,valor_fechado,updated_at")
      .eq("status", "ganho").order("updated_at", { ascending: false }).limit(20),
    // Soma total de TODOS os ganhos — a lista acima mostra só os 20 últimos.
    supabase.from("leads").select("valor_fechado").eq("status", "ganho"),
    supabase.from("notifications").select("id,tipo,titulo,corpo,lida")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(6),
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
  const totalFechado = ((allWon ?? []) as { valor_fechado: number | null }[])
    .reduce((acc, l) => acc + (l.valor_fechado ?? 0), 0);
  const ganhosCount = allWon?.length ?? ganhos.length;

  return <>
    {params.checkout === "sucesso" && (
      <p className="shell-notice" role="status">{t.success}</p>
    )}
    <DashNotifications items={notifs ?? []} title={t.notifT} markAll={t.notifMarkAll} />
    {assinatura && (wallet?.saldo ?? 0) <= 0 && (
      <div className="pay-banner pay-banner-warn" role="status">
        <Zap size={18} className="pay-banner-icon" />
        <div className="pay-banner-text">
          <strong>{t.noCreditsT}</strong>
          <span>{t.noCreditsS}</span>
        </div>
        <Link href="/app/planos#creditos" className="button button-primary button-small">{t.noCreditsCta}</Link>
      </div>
    )}
    <div className="dash-hero">
      <div className="dash-welcome">
        <span className="eyebrow"><span className="status-dot" />{t.eyebrow}</span>
        <h1>{t.welcome},<br />{profile.nome || t.welcomeFallback}<span className="gradient-text">.</span></h1>
        <p className="private-intro">{t.intro}</p>
      </div>
      <div className="dash-insight-stack">
        <Link href="/app/buscar" className="dash-insight">
          <span className="dash-insight-top"><Radar size={16} />{t.n1t}<ArrowUpRight size={18} /></span>
          <strong>{t.n1s}</strong>
          <span className="dash-insight-bottom">{getMessages(loc.lang).shell.seek}<span><ArrowUpRight size={18} /></span></span>
        </Link>
      </div>
    </div>

    <div className="stat-grid dash-metrics">
      <section className="stat-card">
        <span className="stat-icon"><CircleDollarSign size={18} /></span>
        <small>{t.s1l}</small>
        <strong><AnimatedNumber value={wallet?.saldo ?? 0} locales={dateLocale} /></strong>
        <span className="stat-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (wallet?.saldo ?? 0) / Math.max(1, (wallet?.saldo ?? 0) + gastoMes) * 100)}%` }} /></span>
        <span className="stat-sub">{assinatura ? t.s1subOn : dailyActive ? t.s1subOff : t.s1subOffExp}</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><Users size={18} /></span>
        <small>{t.s2l}</small>
        <strong><AnimatedNumber value={leadsTotal ?? 0} locales={dateLocale} /></strong>
        <span className="stat-meter" aria-hidden="true"><i style={{ width: `${(leadsNovos ?? 0) / Math.max(1, leadsTotal ?? 0) * 100}%` }} /></span>
        <span className="stat-sub">{leadsNovos ? `${leadsNovos} ${t.s2subNew}` : t.s2subNone}</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><Radar size={18} /></span>
        <small>{t.s3l}</small>
        <strong><AnimatedNumber value={buscas} locales={dateLocale} /></strong>
        <span className="stat-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, buscas / 30 * 100)}%` }} /></span>
        <span className="stat-sub">{t.s3sub}</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><TrendingUp size={18} /></span>
        <small>{t.s4l}</small>
        <strong><AnimatedNumber value={gastoMes} locales={dateLocale} /></strong>
        <span className="stat-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, gastoMes / Math.max(1, (wallet?.saldo ?? 0) + gastoMes) * 100)}%` }} /></span>
        <span className="stat-sub">{t.s4sub}</span>
      </section>
    </div>

    <div className="dash-overview">
    <section className="dash-panel dash-revenue">
      <div className="dash-panel-heading">
        <h2><TrendingUp size={16} /> {t.s5l}</h2>
        <Link href="/app/leads" aria-label={t.n2t} className="dash-icon-link"><ArrowUpRight size={18} /></Link>
      </div>
      <strong className="dash-revenue-total">{formatMoney(Math.round(totalFechado * 100), loc.currency, loc.lang)}</strong>
      <span className="stat-sub">{t.s5sub} · {ganhosCount}</span>
      <h3 className="dash-list-title">{t.wonTitle}</h3>
      {ganhos.length === 0
        ? <div className="dash-empty"><Users size={23} /><p>{t.wonEmpty}</p><Link className="text-link" href="/app/leads">{t.n2t}<ArrowUpRight size={14} /></Link></div>
        : <ul className="dash-usage">
            {ganhos.map((l) => (
              <li key={l.id}>
                <span><Link className="text-link" href={`/app/leads/${l.id}`}>{l.nome}</Link></span>
                <strong>{l.valor_fechado != null ? formatMoney(Math.round(l.valor_fechado * 100), loc.currency, loc.lang) : "—"}</strong>
              </li>
            ))}
          </ul>}
    </section>

      <section className="dash-panel dash-activity">
        <div className="dash-panel-heading"><h2><Sparkles size={16} /> {t.opsTitle}</h2></div>
        {porAcao.length === 0
          ? <div className="dash-empty"><Radar size={23} /><p>{t.opsEmpty}</p><Link className="text-link" href="/app/buscar">{t.n1t}<ArrowUpRight size={14} /></Link></div>
          : <>
              <ul className="dash-usage dash-usage-bars">
                {porAcao.map(([action, total]) => (
                  <li key={action}>
                    <div><span>{t.actionLabels[action] ?? action}</span>
                    <strong>{total} {total === 1 ? t.credit : t.credits}</strong></div>
                    <span className="dash-usage-track" aria-hidden="true">
                      <i style={{ width: `${total / Math.max(1, porAcao[0][1]) * 100}%` }} />
                    </span>
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

      <section className="dash-panel dash-next">
        <div className="dash-panel-heading"><h2><Compass size={16} /> {t.nextTitle}</h2></div>
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
