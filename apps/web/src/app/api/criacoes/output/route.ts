import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  const { data } = await session.supabase.from("lead_outputs")
    .select("id,tipo,conteudo,modelo,created_at")
    .eq("id", id).eq("user_id", session.user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  return NextResponse.json({ output: data }, { headers: { "Cache-Control": "no-store" } });
}
