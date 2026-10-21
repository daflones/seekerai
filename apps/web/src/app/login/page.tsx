import type { Metadata } from "next";
import { AccessPage } from "@/components/access-page";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: true } };

export default function LoginPage() {
  return <AccessPage login />;
}
