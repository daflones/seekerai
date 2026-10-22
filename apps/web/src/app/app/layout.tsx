import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PrivateShell } from "@/components/private-shell";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha plataforma", robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, loc] = await Promise.all([requireSession(), getLocale()]);
  const t = getMessages(loc.lang);
  const { data: wallet } = await session.supabase
    .from("credit_wallets").select("saldo").eq("user_id", session.user.id).maybeSingle();
  return (
    <PrivateShell
      admin={session.profile.role === "admin"}
      name={session.profile.nome}
      email={session.user.email ?? ""}
      credits={wallet?.saldo ?? null}
      t={t.shell}
    >{children}</PrivateShell>
  );
}
