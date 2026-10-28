import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";

const schema = z.object({
  status: z.enum(["aberto", "em_andamento", "pendente", "resolvido", "cancelado", "expirado"]),
});

// Muda o status do chamado (somente admin).
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Chamado inválido." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Status inválido." }, { status: 400 });

  const { error } = await session.supabase
    .from("support_tickets")
    .update({ status: parsed.data.status, atendente: "admin" })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Não foi possível atualizar o chamado." }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
