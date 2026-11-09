import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PrivateShell } from "@/components/private-shell";
import { getLocale, getTheme } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha plataforma", robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, loc, theme] = await Promise.all([requireSession(), getLocale(), getTheme()]);
  const t = getMessages(loc.lang);
  // O claim da cota diária (escrita) acontece 1x/dia no middleware — aqui
  // basta ler o estado (saldo já vem na resposta).
  const { data: daily } = await session.supabase.rpc("daily_credit_state");
  const saldo = (daily as { saldo?: number } | null)?.saldo ?? null;
  return (
    <PrivateShell
      admin={session.profile.role === "admin"}
      name={session.profile.nome}
      email={session.user.email ?? ""}
      credits={saldo}
      t={t.shell}
      locale={loc}
      theme={theme}
    >{children}</PrivateShell>
  );
}
