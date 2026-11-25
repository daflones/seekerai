import { NextResponse } from "next/server";
import { publicPlanCards } from "@/lib/plans/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLocale, planIntlCents } from "@/lib/i18n";
import { periodMonthlyCents, periodDef } from "@/lib/plans/periods";

// Oferta de planos pra upsells dentro do app (modal de upgrade, card de
// créditos). Mesmo cálculo do checkout: mensal com desconto de 1ª compra
// quando configurado — os valores exibidos aqui são os que a edge cobra.
export const dynamic = "force-dynamic";

export async function GET() {
  const loc = await getLocale();
  const admin = createSupabaseAdminClient();
  const [{ plans }, { data: discRow }, { data: hiddenRow }] = await Promise.all([
    publicPlanCards(),
    admin.from("app_settings").select("value").eq("key", "first_purchase_discount_pct").maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "checkout_hidden").maybeSingle(),
  ]);
  const discountPct = Math.min(90, Math.max(0, Math.trunc(Number(discRow?.value ?? 0)) || 0));
  const hiddenRaw = hiddenRow?.value as { plans?: unknown } | null;
  const hiddenPlans = Array.isArray(hiddenRaw?.plans) ? hiddenRaw.plans : [];

  const offers = plans
    .filter((p) => p.priceCents > 0 && !hiddenPlans.includes(p.slug))
    .sort((a, b) => a.order - b.order)
    .map((p) => {
      const base = loc.isBrazil ? p.priceCents : planIntlCents(p, loc.currency) ?? p.priceCents;
      const monthly = periodMonthlyCents(base, periodDef("mensal"));
      const priceCents = discountPct > 0
        ? Math.max(100, Math.round(monthly * (100 - discountPct) / 100))
        : monthly;
      return {
        slug: p.slug,
        name: p.name,
        featured: p.featured,
        cta: p.content.cta || p.name,
        priceCents,
        wasCents: discountPct > 0 && priceCents < monthly ? monthly : null,
      };
    });

  return NextResponse.json(
    { plans: offers, discountPct, currency: loc.currency, isBrazil: loc.isBrazil },
    { headers: { "Cache-Control": "no-store" } },
  );
}
