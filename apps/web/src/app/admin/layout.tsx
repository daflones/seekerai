import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PrivateShell } from "@/components/private-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administração", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("/admin", { admin: true });
  return (
    <PrivateShell admin adminArea name={session.profile.nome} email={session.user.email ?? ""}>
      {children}
    </PrivateShell>
  );
}
