import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PrivateShell } from "@/components/private-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha plataforma", robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return <PrivateShell admin={session.profile.role === "admin"}>{children}</PrivateShell>;
}
