import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadSite, type SiteConfig } from "@/lib/sites";
import { injectSiteRuntime } from "@/components/site/runtime-payload";
import { EDITOR_HEADER, editorToken } from "@/lib/site-editor";
import { siteStrings } from "@/components/site/site-i18n";
import { BarbershopSite } from "@/components/site/barbershop-site";
import { BeautySite } from "@/components/site/beauty-site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** Trial de 7 dias e tolerância pós-plano/pós-domínio: 7 dias. */
const TRIAL_MS = 7 * 24 * 3600 * 1000;
const GRACE_MS = TRIAL_MS;

/**
 * Gate do site público — checado em tempo real (não é cron).
 * O site fica no ar se QUALQUER proteção valer:
 *   · assinatura ativa;
 *   · domínio ativo dentro da anuidade (+7d de tolerância pós-vencimento);
 *   · plano recém-encerrado dentro do aviso de 7 dias;
 *   · trial de 7 dias pra quem nunca assinou.
 * Vencidas todas as proteções, o site pausa e é despublicado na hora
 * (lazy — não depende de cron). Admin nunca bloqueia.
 */
async function siteBlocked(slug: string, leadId: string | null, ownerId?: string | null): Promise<boolean> {
  if (!process.env.SUPABASE_SECRET_KEY) return false;
  let userId = ownerId ?? null;
  const admin = createSupabaseAdminClient();
  if (!userId && leadId) {
    const { data: lead } = await admin.from("leads")
      .select("user_id").eq("id", leadId).maybeSingle();
    userId = (lead?.user_id as string | undefined) ?? null;
  }
  if (!userId) return false;
  const [{ data: sub }, { data: profile }, { data: domain }] = await Promise.all([
    admin.from("subscriptions").select("status,current_period_end,updated_at")
      .eq("user_id", userId).in("status", ["active", "canceled", "past_due"])
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("profiles").select("created_at,role").eq("id", userId).maybeSingle(),
    admin.from("domains").select("expires_at")
      .eq("site_slug", slug).eq("status", "active").limit(1).maybeSingle(),
  ]);
  if (profile?.role === "admin") return false;
  if (sub?.status === "active") return false;
  const now = Date.now();
  // Domínio vivo segura o site: anuidade + 7 dias de tolerância pra renovar.
  if (domain) {
    const until = domain.expires_at ? Date.parse(domain.expires_at) : NaN;
    if (!Number.isFinite(until) || until + GRACE_MS > now) return false;
  }
  const lapsed = sub?.status === "canceled" || sub?.status === "past_due";
  if (sub && lapsed) {
    // Ex-assinante: aviso de 7 dias contado do fim real do período pago.
    const end = Math.max(
      Date.parse(sub.current_period_end ?? sub.updated_at) || 0,
      Date.parse(sub.updated_at) || 0,
    );
    if (end + GRACE_MS > now) return false;
  } else if (!lapsed) {
    // Nunca assinou (ou só tem checkout pendente) — vale o trial de 7 dias.
    const since = profile?.created_at ? Date.parse(profile.created_at) : NaN;
    if (Number.isFinite(since) && now - since <= TRIAL_MS) return false;
  }
  // Todas as proteções venceram — despublica (o domínio expira junto via RPC).
  await admin.from("sites")
    .update({
      publicado: false,
      desativado_em: new Date(now).toISOString(),
      desativado_motivo: domain ? "domain" : "subscription",
    })
    .eq("slug", slug).eq("publicado", true);
  return true;
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

function SiteGate({ nome, lang }: { nome: string; lang?: string }) {
  const S = siteStrings(lang);
  return (
    <main style={gateStyle.main}>
      <div style={gateStyle.card}>
        <p style={gateStyle.brand}>SEEKERAI</p>
        <h1 style={gateStyle.title}>{S.gateTitle}</h1>
        <p style={gateStyle.text}>
          {S.gateA} <strong>{nome}</strong> {S.gateB}
        </p>
        <Link href="/" style={gateStyle.link}>{S.gateCta}</Link>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) return { title: "Site", robots: { index: false } };
  if (await siteBlocked(slug, site.lead_id)) {
    return { title: siteStrings(site.config.lang).gateTitle, robots: { index: false } };
  }
  return {
    title: site.config.seo?.title ?? site.nome,
    description: site.config.seo?.description ?? undefined,
    openGraph: site.config.fotos?.hero ? { images: [site.config.fotos.hero] } : undefined,
  };
}

export default async function SitePage({ params }: Props) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) notFound();
  // Fetch interno do editor visual: pula o gate pra capturar o HTML.
  const internal = (await headers()).get(EDITOR_HEADER) === editorToken();
  const site = await loadSite(slug, { raw: internal });
  if (site) {
    const owner = site.owner_id ?? (site.config as { owner?: string }).owner ?? null;
    if (!internal && await siteBlocked(slug, site.lead_id, owner)) return <SiteGate nome={site.nome} lang={site.config.lang} />;
    // Projetos do estúdio: HTML gerado por IA, renderizado direto.
    // target=mobile veste moldura de telefone.
    if (site.tipo === "custom" && site.config.html) {
      const isMobile = (site.config as { target?: string }).target === "mobile";
      // Docs capturados antes do runtime: injeta ilha (com o config
      // original) + script na hora de servir — reanima menu/FAQ/agenda.
      const origCfg = (site.config as { orig?: { config?: SiteConfig } }).orig?.config ?? null;
      const doc = injectSiteRuntime(site.config.html, origCfg);
      const frame = (
        <iframe
          srcDoc={doc}
          title={site.nome}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      );
      if (!isMobile) {
        return <div style={{ height: "100dvh" }}>{frame}</div>;
      }
      return (
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#0b0b10", padding: 24 }}>
          <div style={{ width: 402, height: 820, maxWidth: "100%", borderRadius: 36, overflow: "hidden", border: "10px solid #1a1a22", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
            {frame}
          </div>
        </main>
      );
    }
    if (site.tipo === "beleza") return <BeautySite slug={slug} config={site.config} />;
    return <BarbershopSite slug={slug} config={site.config} />;
  }

  // Fallback: sites antigos gerados como HTML cru em lead_outputs (siteSlug do lead).
  const admin = createSupabaseAdminClient();
  const { data: lead } = await admin.from("leads")
    .select("id").eq("dados->>siteSlug", slug).maybeSingle();
  if (!lead) notFound();
  if (await siteBlocked(slug, lead.id)) return <SiteGate nome={slug} />;
  const { data: output } = await admin.from("lead_outputs")
    .select("conteudo").eq("lead_id", lead.id).eq("tipo", "generate_site")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!output?.conteudo) notFound();
  return (
    <iframe
      srcDoc={output.conteudo}
      title="Site do estabelecimento"
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
      style={{ width: "100%", height: "100dvh", border: 0, display: "block" }}
    />
  );
}
