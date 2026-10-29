import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Recursos exclusivos dos planos Pro e King: editor visual de sites,
// domínio personalizado e apps do Estúdio (web/mobile). Essencial e
// contas sem assinatura não usam — admin sempre passa.
const PAID_FEATURE_PLANS = new Set(["pro", "king"]);

export function planAllowsPaidFeatures(slug: string | null | undefined): boolean {
  return typeof slug === "string" && PAID_FEATURE_PLANS.has(slug);
}

export async function userPlanSlug(
  supabase: SupabaseClient, userId: string,
): Promise<string | null> {
  const { data } = await supabase.from("subscriptions")
    .select("plans(slug)")
    .eq("user_id", userId).eq("status", "active").limit(1).maybeSingle();
  const slug = (data?.plans as { slug?: unknown } | null)?.slug;
  return typeof slug === "string" ? slug : null;
}
