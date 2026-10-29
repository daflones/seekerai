import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DomainManager } from "@/components/domain-manager";
import { planAllowsPaidFeatures, userPlanSlug } from "@/lib/plans/capabilities";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Domínios", robots: { index: false } };

export default async function DominiosPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const [{ site: initialSite }, { supabase, user, profile }] = await Promise.all([
    searchParams, requireSession("/app/dominios"),
  ]);
  const admin = createSupabaseAdminClient();
  const planSlug = await userPlanSlug(supabase, user.id);

  // Domínio personalizado é exclusivo dos planos Pro e King.
  if (profile.role !== "admin" && !planAllowsPaidFeatures(planSlug)) {
    return <>
      <span className="eyebrow">SEU ENDEREÇO NA WEB</span>
      <h1>Domínio próprio<span className="gradient-text">.</span></h1>
      <div className="site-soon">
        <span className="site-soon-badge"><Lock size={13} />PLANOS PRO E KING</span>
        <h1>Domínio personalizado pros seus sites.</h1>
        <p>Crie endereços tipo suaempresa.com.br para os sites que você gera — recurso disponível a partir do plano Pro.</p>
        <Link href="/app/planos" className="button button-primary">Ver planos</Link>
      </div>
    </>;
  }

  const [leadSites, studioSites, domainsRes, notifRes, priceRes] = await Promise.all([
    admin.from("sites")
      .select("slug,tipo,nome,leads!inner(user_id)")
      .eq("leads.user_id", user.id).eq("publicado", true),
    admin.from("sites")
      .select("slug,tipo,nome,config")
      .eq("publicado", true)
      .eq("config->>owner", user.id),
    supabase.from("domains")
      .select("id,site_slug,desired_host,host,status,price_cents,expires_at,created_at")
      .order("created_at", { ascending: false }).limit(50),
    supabase.from("notifications")
      .select("id,tipo,titulo,corpo,lida,created_at")
      .order("created_at", { ascending: false }).limit(20),
    admin.from("app_settings").select("value").eq("key", "domain_price_cents").maybeSingle(),
  ]);

  const seen = new Set<string>();
  const sites = [...(leadSites.data ?? []), ...(studioSites.data ?? [])]
    .filter((s) => (seen.has(s.slug) ? false : (seen.add(s.slug), true)))
    .map((s) => ({ slug: s.slug, nome: s.nome, tipo: s.tipo }));

  const priceCents = Math.min(1_000_000, Math.max(500, Number(priceRes.data?.value ?? 6999) || 6999));

  return <>
    <span className="eyebrow">SEU ENDEREÇO NA WEB</span>
    <h1>Domínio próprio<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Aponte um domínio seu para qualquer site publicado. Pagamento anual e
      ativação manual pela nossa equipe em até 48h.
    </p>
    <DomainManager
      sites={sites}
      initialSite={initialSite ?? null}
      domains={domainsRes.data ?? []}
      notifications={notifRes.data ?? []}
      priceCents={priceCents}
    />
  </>;
}
