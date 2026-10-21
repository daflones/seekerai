import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { SearchConsole } from "@/components/search-console";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Buscar oportunidades", robots: { index: false } };

export default async function BuscarPage() {
  const { supabase } = await requireSession("/app/buscar");
  const { data: services } = await supabase
    .from("services_catalog").select("slug,nome").eq("ativo", true).order("nome");

  return <>
    <span className="eyebrow">RADAR DE OPORTUNIDADES</span>
    <h1>Encontre quem precisa de você<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Escolha o serviço que você vende, diga o nicho e a cidade — o radar traz os
      estabelecimentos reais com os sinais de oportunidade (sem site, avaliação, telefone).
    </p>
    <SearchConsole services={services ?? []} />
  </>;
}
