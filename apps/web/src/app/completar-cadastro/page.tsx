import type { Metadata } from "next";
import { AccessPage } from "@/components/access-page";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Complete sua conta", robots: { index: false, follow: false } };

export default async function CompleteProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const session = await requireSession(params.next, { consent: false });
  return <AccessPage mode="onboarding" next={params.next} email={session.user.email} />;
}
