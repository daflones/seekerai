import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { LeadWorkspace } from "@/components/lead-workspace";
import type { LeadRow } from "@/lib/app-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead", robots: { index: false } };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireSession("/app/leads");
  const [{ data: lead }, { data: outputs }, { data: services }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("lead_outputs").select("id,tipo,conteudo,modelo,created_at")
      .eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("services_catalog").select("slug,nome,enabled_actions"),
  ]);
  if (!lead) notFound();

  const service = (services ?? []).find((s) => s.slug === lead.service_slug);

  return <>
    <Link className="text-link lead-back" href="/app/leads"><ArrowLeft size={14} />Todos os leads</Link>
    <LeadWorkspace
      lead={lead as LeadRow}
      outputs={outputs ?? []}
      serviceName={service?.nome ?? lead.service_slug}
      enabledActions={service?.enabled_actions ?? []}
    />
  </>;
}
