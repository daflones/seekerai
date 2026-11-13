import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicPlanCards } from "@/lib/plans/server";
import { cardContentSchema, parseIntlPrices, planSlug, type PlanCard } from "@/lib/plans/model";
import { defaultCardContent } from "@/lib/plans/preview";
import { CREDIT_PACKS, parseCreditPacks } from "@/lib/i18n/shared";
import { PlanCheckout } from "@/components/plan-checkout";
import { PayFailBanner } from "@/components/pay-fail-banner";
import { lastDeclineDetail } from "@/lib/payments/decline";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planos", robots: { index: false } };

export default async function PlanosPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [params, { supabase, user }, loc] = await Promise.all([
    searchParams, requireSession("/app/planos"), getLocale(),
  ]);
  const t = getMessages(loc.lang).plansPage;
  const tDash = getMessages(loc.lang).dash;
  const decline = params.checkout === "cancelado"
    ? await lastDeclineDetail(supabase, user.id) : null;
  const admin = createSupabaseAdminClient();
  const [{ plans }, { data: subscriptions }, { data: discRow }, { data: prevPaid }, { data: planRows }, { data: packsRow }, { data: hiddenRow }, { data: upgRow }] = await Promise.all([
    publicPlanCards(),
    supabase.from("subscriptions").select("id,status,plan_id,billing_months,current_period_end,plans:plan_id(slug)")
      .eq("user_id", user.id).in("status", ["pending", "active", "past_due"]).limit(1),
    admin.from("app_settings").select("value").eq("key", "first_purchase_discount_pct").maybeSingle(),
    admin.from("payments").select("id").eq("user_id", user.id).eq("status", "paid").limit(1),
    supabase.from("plans").select("slug,creditos_mensais").eq("ativo", true),
    admin.from("app_settings").select("value").eq("key", "credit_packs").maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "checkout_hidden").maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "upgrade_discounts").maybeSingle(),
  ]);
  const allPacks = parseCreditPacks(packsRow?.value).length
    ? parseCreditPacks(packsRow?.value)
    : CREDIT_PACKS;
  const sub = subscriptions?.[0];
  const currentPlanSlug = (sub?.plans as { slug?: string } | null)?.slug ?? null;
  // O card do plano atual pode ter sido despublicado da landing — ele sai
  // da view public_plan_cards e o checkout inteiro apagava pro assinante.
  // Busca direto na tabela (o plano segue ativo/legível) só pra resolver
  // o "seu plano" e a grade de troca; a vitrine não muda.
  let lookupPlans = plans;
  if (currentPlanSlug && !plans.some((p) => p.slug === currentPlanSlug)) {
    const { data: cur } = await supabase.from("plans")
      .select("id,slug,nome,preco_centavos,intl_prices,ordem,destaque,card_content,card_revision")
      .eq("slug", currentPlanSlug).maybeSingle();
    const slug = cur ? planSlug.safeParse(cur.slug) : null;
    if (cur && slug?.success) {
      const content = cardContentSchema.safeParse(cur.card_content);
      lookupPlans = [...plans, {
        id: cur.id, slug: slug.data, name: cur.nome, priceCents: cur.preco_centavos,
        order: cur.ordem, featured: cur.destaque, visible: false, revision: cur.card_revision,
        content: content.success ? content.data : defaultCardContent(slug.data),
        intlPrices: parseIntlPrices(cur.intl_prices),
      } satisfies PlanCard];
    }
  }
  const planCredits = Object.fromEntries((planRows ?? []).map((p) => [p.slug, p.creditos_mensais]));
  // Desconto de primeira compra — só aparece para quem nunca pagou.
  const discountPct = (prevPaid ?? []).length === 0
    ? Math.min(90, Math.max(0, Math.trunc(Number(discRow?.value ?? 0)) || 0))
    : 0;
  // Itens ocultos pelo admin somem da vitrine; o plano atual do assinante
  // continua resolvido pela lista completa (allPlans no checkout).
  const hiddenRaw = hiddenRow?.value as { plans?: unknown; packs?: unknown } | null;
  const hiddenPlans = Array.isArray(hiddenRaw?.plans) ? hiddenRaw.plans : [];
  const hiddenPacks = Array.isArray(hiddenRaw?.packs) ? hiddenRaw.packs : [];
  const visiblePlans = plans.filter((p) => !hiddenPlans.includes(p.slug));
  const packs = allPacks.filter((p) => !hiddenPacks.includes(p.id));
  // Desconto de upgrade por transição "de:para" → % (configurável no admin).
  const upgradeDisc = (upgRow?.value ?? {}) as Record<string, number>;

  return <>
    {params.checkout === "cancelado" && <PayFailBanner detail={decline} t={tDash} />}
    <span className="eyebrow">{t.eyebrow}</span>
    <h1>{t.title}<span className="gradient-text">.</span></h1>
    <p className="private-intro">{loc.isBrazil ? t.intro : t.introIntl}</p>
    {visiblePlans.length === 0 && !(subscriptions ?? []).length
      ? <p className="private-intro">{t.empty}</p>
      : <PlanCheckout plans={visiblePlans} allPlans={lookupPlans} hasSubscription={(subscriptions ?? []).length > 0}
          currentPlanSlug={currentPlanSlug} discountPct={discountPct} locale={loc} t={t}
          subEnd={sub?.current_period_end ?? null} subMonths={sub?.billing_months ?? 1}
          planCredits={planCredits} packs={packs} upgradeDisc={upgradeDisc} />}
  </>;
}
