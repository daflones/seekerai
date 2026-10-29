import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { LeadWorkspace } from "@/components/lead-workspace";
import type { LeadRow } from "@/lib/app-client";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { serviceName } from "@/lib/catalog-i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { siteEditorAllowed } from "@/lib/site-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead", robots: { index: false } };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ supabase, user, profile: sessionProfile }, loc] = await Promise.all([requireSession("/app/leads"), getLocale()]);
  const t = getMessages(loc.lang);
  const [{ data: lead }, { data: outputs }, { data: services }, { data: profile }, { data: subs }, { data: daily }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("lead_outputs").select("id,tipo,conteudo,modelo,created_at")
      .eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("services_catalog").select("slug,nome,enabled_actions"),
    supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("status").eq("user_id", user.id).eq("status", "active").limit(1),
    supabase.rpc("claim_daily_credits"),
  ]);
  if (!lead) notFound();

  const service = ((services ?? []) as { slug: string; nome: string; enabled_actions: string[] | null }[])
    .find((s) => s.slug === (lead as { service_slug: string }).service_slug);

  const slug = (lead as { dados?: { siteSlug?: string } }).dados?.siteSlug ?? null;
  // sites tem RLS "só publicado" — o estado de ativação vem do service role.
  let siteState: { active: boolean; motivo: string | null } | null = null;
  if (slug) {
    const admin = createSupabaseAdminClient();
    const { data: site } = await admin.from("sites")
      .select("publicado,desativado_motivo").eq("slug", slug).maybeSingle();
    if (site) siteState = { active: Boolean(site.publicado), motivo: site.desativado_motivo ?? null };
  }

  return <>
    <Link className="text-link lead-back" href="/app/leads"><ArrowLeft size={14} />{t.leadsPage.title}</Link>
    <LeadWorkspace
      lead={lead as LeadRow}
      outputs={outputs ?? []}
      serviceName={service ? serviceName(service.slug, service.nome, loc.lang) : lead.service_slug}
      enabledActions={service?.enabled_actions ?? []}
      siteSlug={slug}
      siteActive={siteState?.active ?? null}
      siteOffMotivo={siteState?.motivo ?? null}
      senderName={((profile as { nome?: string } | null)?.nome) ?? null}
      currency={loc.currency}
      lang={loc.lang}
      trial={!(subs ?? []).length}
      dailyActive={(daily as { ativo?: boolean } | null)?.ativo !== false}
      canEditSite={siteEditorAllowed(user.email, sessionProfile?.role === "admin")}
      t={t.lead}
      statusLabels={t.leadsPage.status}
    />
  </>;
}
