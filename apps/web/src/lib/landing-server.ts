import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseLandingContent } from "@/lib/landing-content";

export async function publicLandingContent() {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "landing_content").maybeSingle();
  const content = parseLandingContent(data?.value);
  // Sem curadoria manual, a vitrine cai para os sites publicados mais
  // recentes — já são públicos em /site/<slug>, então mostrar na landing
  // não expõe nada novo.
  if (!content.showcase_slugs.length) {
    const { data: latest } = await admin.from("sites").select("slug,nome")
      .eq("publicado", true).order("created_at", { ascending: false }).limit(8);
    return { content, sites: (latest ?? []).map((row) => ({ slug: row.slug, name: row.nome })) };
  }
  const { data: rows } = await admin.from("sites").select("slug,nome")
    .eq("publicado", true).in("slug", content.showcase_slugs);
  const bySlug = new Map((rows ?? []).map((row) => [row.slug, { slug: row.slug, name: row.nome }]));
  return { content, sites: content.showcase_slugs.flatMap((slug) => {
    const site = bySlug.get(slug);
    return site ? [site] : [];
  }) };
}
