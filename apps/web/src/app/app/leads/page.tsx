import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { LeadsBoard } from "@/components/leads-board";
import type { LeadRow } from "@/lib/app-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus leads", robots: { index: false } };

export default async function LeadsPage() {
  const { supabase } = await requireSession("/app/leads");
  const [{ data: leads }, { data: services }] = await Promise.all([
    supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("services_catalog").select("slug,nome"),
  ]);
  const serviceNames = Object.fromEntries((services ?? []).map((s) => [s.slug, s.nome]));

  return <>
    <span className="eyebrow">PIPELINE</span>
    <h1>Seus leads<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Cada estabelecimento salvo vira um lead no seu funil. Abra um lead para gerar
      a mensagem de abordagem, a estratégia ou o site com IA.
    </p>
    {(leads ?? []).length === 0
      ? <p className="private-intro">Nada salvo ainda. <Link className="text-link" href="/app/buscar">Faça sua primeira busca</Link></p>
      : <LeadsBoard initialLeads={(leads ?? []) as LeadRow[]} serviceNames={serviceNames} />}
  </>;
}
