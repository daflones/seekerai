import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PortfolioPreview, type PortfolioData } from "@/components/portfolio-builder";

export const dynamic = "force-dynamic";

async function loadPortfolio(slug: string) {
  if (!process.env.SUPABASE_SECRET_KEY) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.from("portfolios").select("*")
      .eq("slug", slug).eq("publicado", true).maybeSingle();
    return data as (PortfolioData & { slug: string }) | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const portfolio = await loadPortfolio(slug);
  if (!portfolio) return { title: "Portfólio", robots: { index: false } };
  return {
    title: `${portfolio.nome} — ${portfolio.profissao || "Portfólio"}`,
    description: portfolio.diferencial || `Portfólio de ${portfolio.nome}. Feito com SeekerAi.`,
    openGraph: {
      title: `${portfolio.nome} — ${portfolio.profissao || "Portfólio"}`,
      description: portfolio.diferencial || `Portfólio de ${portfolio.nome}.`,
      type: "profile",
    },
  };
}

export default async function PortfolioPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const portfolio = await loadPortfolio(slug);
  if (!portfolio) notFound();

  const initials = portfolio.nome.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return <div className="pf-public">
    <PortfolioPreview data={portfolio} initials={initials} />
    <footer className="pf-public-foot">
      <span>Página criada com</span>
      <Link href="/" className="pf-public-brand">SeekerAi</Link>
      <Link href="/cadastro" className="text-link">Crie o seu →</Link>
    </footer>
  </div>;
}
