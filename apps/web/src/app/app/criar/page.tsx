import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { StudioStudio } from "@/components/studio-studio";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { planAllowsPaidFeatures, userPlanSlug } from "@/lib/plans/capabilities";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estúdio", robots: { index: false } };

export default async function CriarPage() {
  const [{ supabase, user, profile }, loc] = await Promise.all([requireSession("/app/criar"), getLocale()]);
  const [{ data: subs }, { data: daily }, planSlug] = await Promise.all([
    supabase.from("subscriptions").select("status")
      .eq("user_id", user.id).eq("status", "active").limit(1),
    supabase.rpc("claim_daily_credits"),
    userPlanSlug(supabase, user.id),
  ]);
  const t = getMessages(loc.lang).studio;

  return <>
    <span className="eyebrow">{t.eyebrow}</span>
    <h1>{t.title}<span className="gradient-text">{t.dot}</span></h1>
    <p className="private-intro">{t.intro}</p>
    {profile.role === "admin" || planAllowsPaidFeatures(planSlug)
      ? <StudioStudio t={t} lang={loc.lang} trial={!(subs ?? []).length}
          dailyActive={(daily as { ativo?: boolean } | null)?.ativo !== false} />
      : <div className="site-soon">
          <span className="site-soon-badge"><Lock size={13} />{t.lockBadge}</span>
          <h1>{t.lockT}</h1>
          <p>{t.lockP}</p>
          <Link href="/app/planos" className="button button-primary">{t.lockB}</Link>
        </div>}
  </>;
}
