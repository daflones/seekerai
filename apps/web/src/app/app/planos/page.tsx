import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { publicPlanCards } from "@/lib/plans/server";
import { PlanCheckout } from "@/components/plan-checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planos", robots: { index: false } };

export default async function PlanosPage() {
  const { supabase, user } = await requireSession("/app/planos");
  const [{ plans }, { data: subscriptions }] = await Promise.all([
    publicPlanCards(),
    supabase.from("subscriptions").select("id,status")
      .eq("user_id", user.id).in("status", ["pending", "active", "past_due"]).limit(1),
  ]);

  return <>
    <span className="eyebrow">ASSINATURA</span>
    <h1>Escolha seu plano<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Cartão via Stripe ou PIX na hora. Os créditos do plano entram todo mês na sua carteira.
    </p>
    {plans.length === 0
      ? <p className="private-intro">Nenhum plano disponível no momento.</p>
      : <PlanCheckout plans={plans} hasSubscription={(subscriptions ?? []).length > 0} />}
  </>;
}
