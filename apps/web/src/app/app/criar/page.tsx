import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { StudioStudio } from "@/components/studio-studio";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estúdio", robots: { index: false } };

export default async function CriarPage() {
  const [session, loc] = await Promise.all([requireSession("/app/criar"), getLocale()]);
  void session;
  const m = getMessages(loc.lang);
  const t = m.studio;

  return <>
    <span className="eyebrow">{t.eyebrow}</span>
    <h1>{t.title}<span className="gradient-text">{t.dot}</span></h1>
    <p className="private-intro">{t.intro}</p>
    <StudioStudio t={t} lang={loc.lang} />
  </>;
}
