import type { Metadata } from "next";
import { AccessPage } from "@/components/access-page";

export const metadata: Metadata = { title: "Acesso antecipado", robots: { index: false, follow: true } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plano?: string }> }) {
  const { plano } = await searchParams;
  return <AccessPage plan={plano} />;
}
