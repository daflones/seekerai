import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { LeadsBoard } from "@/components/leads-board";
import type { LeadRow } from "@/lib/app-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus leads", robots: { index: false } };

export default async function LeadsPage() {
  const { supabase } = await requireSession("/app/leads");
  const [{ data: leads }, { data: services }, { data: rules }] = await Promise.all([
    supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("services_catalog").select("slug,nome,enabled_actions"),
    supabase.from("credit_action_rules").select("action,cost,enabled"),
  ]);
  const serviceNames = Object.fromEntries((services ?? []).map((s) => [s.slug, s.nome]));
  const serviceActions = Object.fromEntries((services ?? []).map((s) => [s.slug, s.enabled_actions ?? []]));
  const costs = Object.fromEntries((rules ?? []).map((r) => [r.action, r.enabled ? r.cost : null]));

  return <>
    <span className="eyebrow">PIPELINE</span>
    <h1>Seus leads<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Cada card já traz os sinais do estabelecimento e as ações de IA do seu serviço —
      gere a mensagem, a estratégia, o site ou a imagem sem sair da lista.
    </p>
    {(leads ?? []).length === 0
      ? <p className="private-intro">Nada salvo ainda. <Link className="text-link" href="/app/buscar">Faça sua primeira busca</Link></p>
      : <LeadsBoard initialLeads={(leads ?? []) as LeadRow[]} serviceNames={serviceNames} serviceActions={serviceActions} costs={costs} />}
  </>;
}
