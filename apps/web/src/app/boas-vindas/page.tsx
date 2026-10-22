import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { WelcomeQuiz } from "@/components/welcome-quiz";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Boas-vindas", robots: { index: false, follow: false } };

export default async function BoasVindasPage() {
  const [{ profile }, loc] = await Promise.all([requireSession("/boas-vindas"), getLocale()]);
  if (profile.onboarding_visto_em) redirect("/app");
  return <WelcomeQuiz name={profile.nome} t={getMessages(loc.lang).welcome} />;
}
