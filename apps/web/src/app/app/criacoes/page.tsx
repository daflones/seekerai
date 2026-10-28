import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { UserCreations } from "@/components/user-creations";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minhas criações", robots: { index: false } };

export default async function CriacoesPage() {
  const [session, loc] = await Promise.all([requireSession("/app/criacoes"), getLocale()]);
  void session;
  const t = getMessages(loc.lang).creationsPage;

  return <>
    <span className="eyebrow">{t.eyebrow}</span>
    <h1>{t.title}<span className="gradient-text">.</span></h1>
    <p className="private-intro">{t.intro}</p>
    <UserCreations t={t} lang={loc.lang} />
  </>;
}
