import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { loadEditableSite } from "@/lib/site-editor";
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
  const site = await loadEditableSite(slug, session.user.id, session.profile.role === "admin");
  if (!site) notFound();
  return <SiteEditor slug={slug} nome={site.nome} lang={loc.lang} t={getMessages(loc.lang).siteEdit} />;
}
