import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { SearchConsole } from "@/components/search-console";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Buscar oportunidades", robots: { index: false } };

export default async function BuscarPage() {
  const { supabase, user, profile } = await requireSession("/app/buscar");
  const [{ data: services }, { data: subs }] = await Promise.all([
    supabase.from("services_catalog").select("slug,nome,categoria").eq("ativo", true).order("nome"),
    supabase.from("subscriptions").select("status").eq("user_id", user.id)
      .in("status", ["active"]).limit(1),
  ]);
  const canSearch = profile.role === "admin" || Boolean(subs?.length);

  return <>
    <span className="eyebrow">RADAR DE OPORTUNIDADES</span>
    <h1>Encontre quem precisa de você<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Escolha o serviço, o nicho e a cidade — o radar traz os estabelecimentos reais com os
      sinais de oportunidade (sem site, avaliação, telefone, WhatsApp verificado).
    </p>
    <SearchConsole services={services ?? []} canSearch={canSearch} />
  </>;
}
