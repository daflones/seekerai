import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import { supabasePublicConfig } from "../auth/config";
import { cardContentSchema, planSlug, type PlanCard, type PlanSource } from "./model";
import { previewPlanCards } from "./preview";

export async function publicPlanCards(): Promise<{ plans: PlanCard[]; source: PlanSource }> {
  noStore();
  const config = supabasePublicConfig();
  if (!config) return { plans: structuredClone(previewPlanCards), source: "preview" };
  // Use an anonymous client: a logged-in admin must not leak draft cards into the landing.
  const supabase = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store", signal: AbortSignal.timeout(8000) }) },
  });
  try {
    const { data, error } = await supabase.from("public_plan_cards")
      .select("id,slug,nome,preco_centavos,ordem,destaque,card_content,card_revision").order("ordem");
    if (error || !data) return { plans: [], source: "unavailable" };
    const plans: PlanCard[] = [];
    for (const row of data) {
      // Sem plano grátis: mesmo que a flag seja reativada no admin,
      // o card não volta pra landing nem pro checkout.
      if (row.slug === "gratis") continue;
      const slug = planSlug.safeParse(row.slug);
      const content = cardContentSchema.safeParse(row.card_content);
      if (!slug.success || !content.success || !Number.isSafeInteger(row.preco_centavos) || row.preco_centavos < 0) {
        return { plans: [], source: "unavailable" };
      }
      plans.push({
        id: row.id, slug: slug.data, name: row.nome, priceCents: row.preco_centavos,
        order: row.ordem, featured: row.destaque, visible: true, revision: row.card_revision, content: content.data,
      });
    }
    return { plans, source: "database" };
  } catch { return { plans: [], source: "unavailable" }; }
}
