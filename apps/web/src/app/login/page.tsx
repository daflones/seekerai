import type { Metadata } from "next";
import { AccessPage } from "@/components/access-page";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; estado?: string }> }) {
  const params = await searchParams;
  return <AccessPage login next={params.next} state={params.estado} />;
}
