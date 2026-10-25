import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadSite } from "@/lib/sites";
import { BarbershopSite } from "@/components/site/barbershop-site";
import { BeautySite } from "@/components/site/beauty-site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** Trial de 7 dias: sem plano ativo depois disso, o site público pausa. */
const TRIAL_MS = 7 * 24 * 3600 * 1000;

/**
 * Gate do site público — checado em tempo real (não é cron): assinou,
 * libera no próximo request; venceu o trial sem plano, pausa na hora.
 * Admin (donos) e sites sem dono rastreável nunca bloqueiam.
 */
async function siteBlocked(leadId: string | null): Promise<boolean> {
  if (!leadId || !process.env.SUPABASE_SECRET_KEY) return false;
  const admin = createSupabaseAdminClient();
  const { data: lead } = await admin.from("leads")
    .select("user_id").eq("id", leadId).maybeSingle();
  const userId = lead?.user_id as string | undefined;
  if (!userId) return false;
  const [{ data: sub }, { data: profile }] = await Promise.all([
    admin.from("subscriptions").select("user_id")
      .eq("user_id", userId).eq("status", "active").limit(1).maybeSingle(),
    admin.from("profiles").select("created_at,role").eq("id", userId).maybeSingle(),
  ]);
  if (sub || profile?.role === "admin") return false;
  const since = profile?.created_at ? Date.parse(profile.created_at) : NaN;
  // Perfil ausente = sem prova de trial → trata como expirado.
  return !Number.isFinite(since) || Date.now() - since > TRIAL_MS;
}

const gateStyle: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100dvh", display: "grid", placeItems: "center",
    background: "#0b0b10", color: "#f3f0e8", padding: 24,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: { maxWidth: 460, textAlign: "center" },
  brand: { fontSize: 13, letterSpacing: 4, color: "#a78bfa", margin: "0 0 18px" },
  title: { fontSize: 30, margin: "0 0 12px" },
  text: { fontSize: 15, lineHeight: 1.7, color: "#a7a3b8", margin: "0 0 22px" },
  link: { fontSize: 13, color: "#a78bfa", textDecoration: "none" },
};

function SiteGate({ nome }: { nome: string }) {
  return (
    <main style={gateStyle.main}>
      <div style={gateStyle.card}>
        <p style={gateStyle.brand}>SEEKERAI</p>
        <h1 style={gateStyle.title}>Site em pausa</h1>
        <p style={gateStyle.text}>
          O site de <strong>{nome}</strong> está temporariamente indisponível.
          Se você é o proprietário, assine um plano na sua conta SeekerAi e ele
          volta ao ar imediatamente.
        </p>
        <Link href="/" style={gateStyle.link}>Criado com SeekerAi →</Link>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) return { title: "Site", robots: { index: false } };
  if (await siteBlocked(site.lead_id)) {
    return { title: "Site em pausa", robots: { index: false } };
  }
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
    if (await siteBlocked(site.lead_id)) return <SiteGate nome={site.nome} />;
    if (site.tipo === "beleza") return <BeautySite slug={slug} config={site.config} />;
    return <BarbershopSite slug={slug} config={site.config} />;
  }

  // Fallback: sites antigos gerados como HTML cru em lead_outputs (siteSlug do lead).
  const admin = createSupabaseAdminClient();
  const { data: lead } = await admin.from("leads")
    .select("id").eq("dados->>siteSlug", slug).maybeSingle();
  if (!lead) notFound();
  if (await siteBlocked(lead.id)) return <SiteGate nome={slug} />;
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
