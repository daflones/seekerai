import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { LeadsBoard } from "@/components/leads-board";
import type { LeadRow } from "@/lib/app-client";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus leads", robots: { index: false } };

export default async function LeadsPage() {
  const [{ supabase }, loc] = await Promise.all([requireSession("/app/leads"), getLocale()]);
  const t = getMessages(loc.lang).leadsPage;
  const [{ data: leads }, { data: services }, { data: rules }] = await Promise.all([
    supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("services_catalog").select("slug,nome,enabled_actions"),
    supabase.from("credit_action_rules").select("action,cost,enabled"),
  ]);
  type Service = { slug: string; nome: string; enabled_actions: string[] | null };
  type Rule = { action: string; cost: number; enabled: boolean };
  const serviceNames = Object.fromEntries(((services ?? []) as Service[]).map((s) => [s.slug, s.nome]));
  const serviceActions = Object.fromEntries(((services ?? []) as Service[]).map((s) => [s.slug, s.enabled_actions ?? []]));
  const costs = Object.fromEntries(((rules ?? []) as Rule[]).map((r) => [r.action, r.enabled ? r.cost : null]));

  return <>
    <span className="eyebrow">{t.eyebrow}</span>
    <h1>{t.title}<span className="gradient-text">.</span></h1>
    <p className="private-intro">{t.intro}</p>
    {(leads ?? []).length === 0
      ? <p className="private-intro">{t.empty} <Link className="text-link" href="/app/buscar">{t.emptyLink}</Link></p>
      : <LeadsBoard initialLeads={(leads ?? []) as LeadRow[]} serviceNames={serviceNames} serviceActions={serviceActions} costs={costs} t={t} />}
  </>;
}
