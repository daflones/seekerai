import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";

const OPEN = ["aberto", "em_andamento", "pendente"];
const messageSchema = z.object({ mensagem: z.string().trim().min(1).max(4000) });

type Params = { params: Promise<{ id: string }> };

async function loadTicket(request: NextRequest, ctx: Params) {
  if (request.method !== "GET" && !allowedOrigin(request.headers.get("origin"))) {
    return { error: NextResponse.json({ error: "Origem não permitida." }, { status: 403 }) };
  }
  const session = await verifiedSession();
  if (!session) return { error: NextResponse.json({ error: "Entre novamente." }, { status: 401 }) };
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: NextResponse.json({ error: "Chamado inválido." }, { status: 400 }) };
  const { data: ticket } = await session.supabase
    .from("support_tickets")
    .select("id,assunto,categoria,prioridade,status,created_at,user_id")
    .eq("id", id).maybeSingle();
  if (!ticket) return { error: NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 }) };
  return { session, ticket };
}

export async function GET(request: NextRequest, ctx: Params) {
  const found = await loadTicket(request, ctx);
  if ("error" in found) return found.error;
  const { data: mensagens } = await found.session.supabase
    .from("ticket_messages")
    .select("id,sender_role,mensagem,created_at")
    .eq("ticket_id", found.ticket.id)
    .order("created_at", { ascending: true })
    .limit(300);
  return NextResponse.json(
    { ticket: found.ticket, mensagens: mensagens ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest, ctx: Params) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const found = await loadTicket(request, ctx);
  if ("error" in found) return found.error;
  const { session, ticket } = found;
  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) return NextResponse.json({ error: "Aguarde antes de enviar outra mensagem." }, { status: 429 });

  const isAdmin = session.profile?.role === "admin";
  if (!isAdmin && !OPEN.includes(ticket.status)) {
    return NextResponse.json({ error: "Este chamado está encerrado e não aceita novas mensagens." }, { status: 409 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Escreva uma mensagem (até 4000 caracteres)." }, { status: 400 });

  const role = isAdmin ? "admin" : "user";
  const { data, error } = await session.supabase.from("ticket_messages").insert({
    ticket_id: ticket.id, sender_id: session.user.id, sender_role: role, mensagem: parsed.data.mensagem,
  }).select("id,sender_role,mensagem,created_at").single();
  if (error) return NextResponse.json({ error: "Não foi possível enviar a mensagem." }, { status: 500 });

  // Resposta do suporte marca o chamado como em andamento.
  if (isAdmin && ticket.status === "aberto") {
    await session.supabase.from("support_tickets").update({ status: "em_andamento" }).eq("id", ticket.id);
  }
  return NextResponse.json({ mensagem: data }, { headers: { "Cache-Control": "no-store" } });
}
