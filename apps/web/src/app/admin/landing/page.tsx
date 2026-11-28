import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { parseLandingContent } from "@/lib/landing-content";
import { AdminLandingContent } from "@/components/admin-landing-content";
import { AdminLandingPrices } from "@/components/admin-landing-prices";
import "@/app/landing-ui.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Landing page", robots: { index: false, follow: false } };

export default async function AdminLandingPage() {
  const { supabase } = await requireSession("/admin/landing", { admin: true });
  const [{ data: rows, error }, { data: sites, error: siteError }] = await Promise.all([
    supabase.from("app_settings").select("key,value").in("key", ["landing_content", "landing_show_prices"]),
    supabase.from("sites").select("slug,nome,publicado").order("created_at", { ascending: false }).limit(150),
  ]);
  if (error || siteError) return <p className="auth-error" role="alert">Não foi possível carregar a configuração. Recarregue antes de editar.</p>;
  const content = parseLandingContent(rows?.find((r) => r.key === "landing_content")?.value);
  const options = (sites ?? []).filter((s) => s.publicado).map((s) => ({ slug: s.slug, name: s.nome }));
  return <>
    <span className="eyebrow">A PRIMEIRA IMPRESSÃO</span>
    <h1>Landing page<span className="gradient-text">.</span></h1>
    <p className="private-intro">Controle o vídeo de demonstração e escolha os sites reais que podem aparecer na vitrine pública.</p>
    <AdminLandingContent initial={content} sites={options} />
    <AdminLandingPrices initial={rows?.find((r) => r.key === "landing_show_prices")?.value !== false} />
  </>;
}
