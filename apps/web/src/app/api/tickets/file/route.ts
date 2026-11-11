import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Lê anexo do chamado: o path é "<ticketId>/<arquivo>" — só o dono do
// chamado ou admin recebem a URL assinada (curta, ~5min) do bucket privado.
export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const path = request.nextUrl.searchParams.get("p") ?? "";
  const match = path.match(/^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(png|jpg|webp|gif|pdf)$/i);
  if (!match) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: ticket } = await admin.from("support_tickets")
    .select("user_id").eq("id", match[1]).maybeSingle();
  const isAdmin = session.profile?.role === "admin";
  if (!ticket || (!isAdmin && ticket.user_id !== session.user.id)) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const { data, error } = await admin.storage.from("support-files").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl);
}
