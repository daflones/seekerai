import type { Metadata } from "next";
import { AccessPage } from "@/components/access-page";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false, follow: false } };

export default async function NewPasswordPage() {
  await requireSession("/app", { consent: false });
  return <AccessPage mode="password" />;
}
