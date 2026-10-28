import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { triggerSupportAgent } from "@/lib/support/agent";

const schema = z.object({
  assunto: z.string().trim().min(5, "Descreva o assunto (mín. 5 caracteres).").max(140),
  categoria: z.enum(["tecnico", "cobranca", "creditos", "sugestao", "outro"]),
  prioridade: z.enum(["baixa", "normal", "alta"]),
  mensagem: z.string().trim().min(10, "Conte o que aconteceu (mín. 10 caracteres).").max(4000),
});

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) return NextResponse.json({ error: "Aguarde antes de enviar outro chamado." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revise os campos." }, { status: 400 });
  }
  const { data: ticket, error } = await session.supabase.from("support_tickets").insert({
    user_id: session.user.id,
    assunto: parsed.data.assunto,
    categoria: parsed.data.categoria,
    prioridade: parsed.data.prioridade,
    mensagem: parsed.data.mensagem,
  }).select("id").single();
  if (error || !ticket) return NextResponse.json({ error: "Não foi possível abrir o chamado." }, { status: 500 });
  // A descrição inicial vira a primeira mensagem da conversa.
  await session.supabase.from("ticket_messages").insert({
    ticket_id: ticket.id, sender_id: session.user.id, sender_role: "user",
    mensagem: parsed.data.mensagem,
  });
  triggerSupportAgent(ticket.id);
  return NextResponse.json({ ok: true, id: ticket.id }, { headers: { "Cache-Control": "no-store" } });
}
