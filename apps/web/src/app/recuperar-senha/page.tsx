import type { Metadata } from "next";
import { AccessPage } from "@/components/access-page";

export const metadata: Metadata = { title: "Recuperar acesso", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function RecoverPage() {
  return <AccessPage mode="recover" />;
}
