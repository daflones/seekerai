import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { AccountSettings } from "@/components/account-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha conta", robots: { index: false } };

export default async function ContaPage() {
  const [{ supabase, user, profile }, loc] = await Promise.all([
    requireSession("/app/conta"), getLocale(),
  ]);
  const t = getMessages(loc.lang).account;
  // telefone não vem no perfil da sessão — busca direto.
  const { data: row } = await supabase.from("profiles")
    .select("telefone").eq("id", user.id).single();

  return <>
    <span className="eyebrow">{t.eyebrow}</span>
    <h1>{t.title}<span className="gradient-text">.</span></h1>
    <p className="private-intro">{t.intro}</p>
    <AccountSettings
      nome={profile?.nome ?? ""}
      email={user.email ?? ""}
      telefone={(row?.telefone as string | null) ?? null}
      t={t} />
  </>;
}
