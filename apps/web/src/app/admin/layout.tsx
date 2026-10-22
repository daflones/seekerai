import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PrivateShell } from "@/components/private-shell";
import { getLocale, getTheme } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administração", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, loc, theme] = await Promise.all([requireSession("/admin", { admin: true }), getLocale(), getTheme()]);
  return (
    <PrivateShell admin adminArea name={session.profile.nome} email={session.user.email ?? ""} locale={loc} theme={theme}>
      {children}
    </PrivateShell>
  );
}
