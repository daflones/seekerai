import { NextResponse } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { fetchProviderCredits } from "@/lib/admin/provider-credits";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }
  const { credits, at } = await fetchProviderCredits();
  return NextResponse.json({ credits, at }, { headers: { "Cache-Control": "no-store" } });
}
