import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PortfolioBuilder, type PortfolioData } from "@/components/portfolio-builder";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meu portfólio", robots: { index: false } };

export default async function PortfolioPage() {
  const [{ supabase, user, profile }, loc] = await Promise.all([requireSession("/app/portfolio"), getLocale()]);
  const t = getMessages(loc.lang).misc;
  const [{ data: portfolio }, { data: subs }] = await Promise.all([
    supabase.from("portfolios").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("status").eq("user_id", user.id).eq("status", "active").limit(1),
  ]);
  const pro = Boolean(subs?.length) || profile.role === "admin";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://seekerai.digital").replace(/\/$/, "");

  return <>
    <span className="eyebrow">{t.portfolioEyebrow}</span>
    <h1>{t.portfolioTitle}<span className="gradient-text">.</span></h1>
    <p className="private-intro">{t.portfolioIntro}</p>
    <PortfolioBuilder initial={(portfolio as PortfolioData | null) ?? null} pro={pro} appUrl={appUrl} />
  </>;
}
