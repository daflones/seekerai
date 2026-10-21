import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { SearchConsole } from "@/components/search-console";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Buscar oportunidades", robots: { index: false } };

const FREE_SEARCHES = 2;

export default async function BuscarPage() {
  const { supabase, user, profile } = await requireSession("/app/buscar");
  const [{ data: services }, { data: subs }, { count: used }] = await Promise.all([
    supabase.from("services_catalog").select("slug,nome,categoria").eq("ativo", true).order("nome"),
    supabase.from("subscriptions").select("status").eq("user_id", user.id)
      .in("status", ["active"]).limit(1),
    supabase.from("credit_operations").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("action", "search")
      .in("status", ["reserved", "completed"]),
  ]);
  const subscribed = Boolean(subs?.length);
  const freeLeft = subscribed || profile.role === "admin"
    ? null
    : Math.max(0, FREE_SEARCHES - (used ?? 0));
  const canSearch = profile.role === "admin" || subscribed || (freeLeft ?? 0) > 0;

  return <>
    <span className="eyebrow">RADAR DE OPORTUNIDADES</span>
    <h1>Encontre quem precisa de você<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Escolha o serviço, o nicho e a cidade — o radar traz os estabelecimentos reais com os
      sinais de oportunidade (sem site, avaliação, telefone, WhatsApp verificado).
    </p>
    <SearchConsole services={services ?? []} canSearch={canSearch} freeSearchesLeft={freeLeft} />
  </>;
}
