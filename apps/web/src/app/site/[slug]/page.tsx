import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadSite } from "@/lib/sites";
import { BarbershopSite } from "@/components/site/barbershop-site";
import { BeautySite } from "@/components/site/beauty-site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) return { title: "Site", robots: { index: false } };
  return {
    title: site.config.seo?.title ?? site.nome,
    description: site.config.seo?.description ?? undefined,
    openGraph: site.config.fotos.hero ? { images: [site.config.fotos.hero] } : undefined,
  };
}

export default async function SitePage({ params }: Props) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) notFound();
  const site = await loadSite(slug);
  if (site) {
    if (site.tipo === "beleza") return <BeautySite slug={slug} config={site.config} />;
    return <BarbershopSite slug={slug} config={site.config} />;
  }

  // Fallback: sites antigos gerados como HTML cru em lead_outputs (siteSlug do lead).
  const admin = createSupabaseAdminClient();
  const { data: lead } = await admin.from("leads")
    .select("id").eq("dados->>siteSlug", slug).maybeSingle();
  if (!lead) notFound();
  const { data: output } = await admin.from("lead_outputs")
    .select("conteudo").eq("lead_id", lead.id).eq("tipo", "generate_site")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!output?.conteudo) notFound();
  return (
    <iframe
      srcDoc={output.conteudo}
      title="Site do estabelecimento"
      style={{ width: "100%", height: "100dvh", border: 0, display: "block" }}
    />
  );
}
