import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { SearchConsole } from "@/components/search-console";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { serviceCategory, serviceName } from "@/lib/catalog-i18n";
import { getServicesCatalog } from "@/lib/catalog-cache";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Buscar oportunidades", robots: { index: false } };

export default async function BuscarPage({ searchParams }: {
  searchParams: Promise<{ primeira?: string }>;
}) {
  const [{ supabase, user, profile }, loc, params] = await Promise.all([
    requireSession("/app/buscar"), getLocale(), searchParams,
  ]);
  const t = getMessages(loc.lang).seek;
  // Créditos diários gratuitos foram descontinuados — sem recarga diária,
  // quem bloqueia vê direto a mensagem de assinatura (não "volta amanhã").
  const dailyActive = false;
  const [catalog, { data: subs }, { data: wallet }] = await Promise.all([
    getServicesCatalog(),
    supabase.from("subscriptions").select("status").eq("user_id", user.id)
      .in("status", ["active"]).limit(1),
    supabase.from("credit_wallets").select("saldo").eq("user_id", user.id).maybeSingle(),
  ]);
  const services = catalog.filter((s) => s.ativo);
  const subscribed = Boolean(subs?.length);
  const saldo = wallet?.saldo ?? 0;
  // Trial: créditos de boas-vindas liberam a busca — a edge cobra
  // 4 créditos por pesquisa. Saldo 0 → o console abre o upsell.
  const canSearch = profile.role === "admin" || subscribed || saldo > 0;
  const freeSearchesLeft = profile.role === "admin" || subscribed
    ? null
    : Math.floor(saldo / 4);

  return <>
    <span className="eyebrow">{t.eyebrow}</span>
    <h1>{t.title}<span className="gradient-text">.</span></h1>
    <p className="private-intro">{t.intro}</p>
    <SearchConsole
      services={((services ?? []) as { slug: string; nome: string; categoria: string }[])
        .map((s) => ({ slug: s.slug, nome: serviceName(s.slug, s.nome, loc.lang), categoria: serviceCategory(s.categoria, loc.lang) }))}
      canSearch={canSearch} subscribed={subscribed} freeSearchesLeft={freeSearchesLeft}
      dailyActive={dailyActive} firstSearch={params.primeira === "1"}
      loc={loc} t={t} />
  </>;
}
