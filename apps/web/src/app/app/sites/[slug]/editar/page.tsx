import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { loadEditableSite, siteEditorAllowed } from "@/lib/site-editor";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { SiteEditor } from "@/components/site-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editor de site", robots: { index: false } };

export default async function EditSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [session, loc] = await Promise.all([
    requireSession(`/app/sites/${slug}/editar`), getLocale(),
  ]);
  const t = getMessages(loc.lang).siteEdit;

  // Beta fechado: fora do grupo autorizado vê a tela "em breve".
  if (!siteEditorAllowed(session.user.email, session.profile.role === "admin")) {
    return <div className="site-soon">
      <span className="site-soon-badge"><Sparkles size={13} />{t.soon}</span>
      <h1>{t.title}</h1>
      <p>{t.soonText}</p>
      <Link href="/app" className="text-link"><ArrowLeft size={14} />{t.back}</Link>
    </div>;
  }

  const site = await loadEditableSite(slug, session.user.id, session.profile.role === "admin");
  if (!site) notFound();
  return <SiteEditor slug={slug} nome={site.nome} lang={loc.lang} t={t} />;
}
