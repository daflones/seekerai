import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const OPEN = ["aberto", "em_andamento", "pendente"];
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
const MAX_BYTES = 8 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

// Anexo de chamado: sobe pro bucket privado support-files e devolve o
// path — a mensagem referencia ele e a leitura sai por /api/tickets/file.
export async function POST(request: NextRequest, ctx: Params) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Chamado inválido." }, { status: 400 });
  }
  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de anexar outro arquivo." }, { status: 429 });
  }

  const admin = createSupabaseAdminClient();
  const { data: ticket } = await admin.from("support_tickets")
    .select("id,status,user_id").eq("id", id).maybeSingle();
  const isAdmin = session.profile?.role === "admin";
  if (!ticket || (!isAdmin && ticket.user_id !== session.user.id)) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }
  if (!isAdmin && !OPEN.includes(ticket.status)) {
    return NextResponse.json({ error: "Este chamado está encerrado." }, { status: 409 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo." }, { status: 400 });
  }
  const ext = MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Só imagens (PNG/JPG/WebP/GIF) ou PDF." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo acima de 8 MB." }, { status: 413 });
  }

  const path = `${id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("support-files").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: "Não foi possível anexar." }, { status: 500 });
  }
  const nome = (file.name || `anexo.${ext}`).split(/[\\/]/).pop()!.slice(0, 160);
  return NextResponse.json(
    { anexo: { path, nome, tipo: file.type, tamanho: file.size } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
