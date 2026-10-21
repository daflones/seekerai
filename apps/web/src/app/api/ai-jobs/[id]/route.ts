import { NextResponse } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const STALE_MS = 8 * 60_000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const { id } = await params;
  const { data, error } = await session.supabase.from("ai_jobs")
    .select("id,status,lead_id,result,erro,created_at")
    .eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Geração não encontrada." }, { status: 404 });
  if (data.status === "running" && Date.now() - new Date(data.created_at).getTime() > STALE_MS) {
    const erro = "A geração expirou. Tente novamente.";
    const admin = createSupabaseAdminClient();
    await admin.from("ai_jobs")
      .update({ status: "error", erro, updated_at: new Date().toISOString() })
      .eq("id", id).eq("status", "running");
    return NextResponse.json({ job: { ...data, status: "error", erro } },
      { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ job: data }, { headers: { "Cache-Control": "no-store" } });
}
