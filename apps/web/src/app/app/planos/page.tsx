import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicPlanCards } from "@/lib/plans/server";
import { PlanCheckout } from "@/components/plan-checkout";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planos", robots: { index: false } };

export default async function PlanosPage() {
  const [{ supabase, user }, loc] = await Promise.all([requireSession("/app/planos"), getLocale()]);
  const t = getMessages(loc.lang).plansPage;
  const admin = createSupabaseAdminClient();
  const [{ plans }, { data: subscriptions }, { data: discRow }, { data: prevPaid }, { data: planRows }] = await Promise.all([
    publicPlanCards(),
    supabase.from("subscriptions").select("id,status,plan_id,billing_months,current_period_end,plans:plan_id(slug)")
      .eq("user_id", user.id).in("status", ["pending", "active", "past_due"]).limit(1),
    admin.from("app_settings").select("value").eq("key", "first_purchase_discount_pct").maybeSingle(),
    admin.from("payments").select("id").eq("user_id", user.id).eq("status", "paid").limit(1),
    supabase.from("plans").select("slug,creditos_mensais").eq("ativo", true),
  ]);
  const sub = subscriptions?.[0];
  const currentPlanSlug = (sub?.plans as { slug?: string } | null)?.slug ?? null;
  const planCredits = Object.fromEntries((planRows ?? []).map((p) => [p.slug, p.creditos_mensais]));
  // Desconto de primeira compra — só aparece para quem nunca pagou.
  const discountPct = (prevPaid ?? []).length === 0
    ? Math.min(90, Math.max(0, Math.trunc(Number(discRow?.value ?? 0)) || 0))
    : 0;

  return <>
    <span className="eyebrow">{t.eyebrow}</span>
    <h1>{t.title}<span className="gradient-text">.</span></h1>
    <p className="private-intro">{loc.isBrazil ? t.intro : t.introIntl}</p>
    {plans.length === 0
      ? <p className="private-intro">{t.empty}</p>
      : <PlanCheckout plans={plans} hasSubscription={(subscriptions ?? []).length > 0}
          currentPlanSlug={currentPlanSlug} discountPct={discountPct} locale={loc} t={t}
          subEnd={sub?.current_period_end ?? null} subMonths={sub?.billing_months ?? 1}
          planCredits={planCredits} />}
  </>;
}
