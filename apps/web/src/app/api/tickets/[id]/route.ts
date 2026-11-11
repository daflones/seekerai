import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { triggerSupportAgent } from "@/lib/support/agent";

const OPEN = ["aberto", "em_andamento", "pendente"];
const anexoSchema = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp|gif|pdf)$/i),
  nome: z.string().trim().min(1).max(160),
  tipo: z.string().max(80),
  tamanho: z.number().int().min(0).max(10_000_000).optional(),
});
const messageSchema = z.object({
  mensagem: z.string().trim().max(4000).optional().default(""),
  reply_to: z.string().uuid().nullish(),
  anexos: z.array(anexoSchema).max(4).optional(),
});

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
    .select("id,assunto,categoria,prioridade,status,created_at,user_id,atendente")
    .eq("id", id).maybeSingle();
  if (!ticket) return { error: NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 }) };
  return { session, ticket };
}

export async function GET(request: NextRequest, ctx: Params) {
  const found = await loadTicket(request, ctx);
  if ("error" in found) return found.error;
  const { data: mensagens } = await found.session.supabase
    .from("ticket_messages")
    .select("id,sender_role,mensagem,anexos,reply_to,created_at")
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
  if (!parsed.success) return NextResponse.json({ error: "Revise a mensagem (até 4000 caracteres) e os anexos." }, { status: 400 });
  const anexos = (parsed.data.anexos ?? []).filter((a) =>
    a.path.startsWith(`${ticket.id}/`));
  if (!parsed.data.mensagem && anexos.length === 0) {
    return NextResponse.json({ error: "Escreva uma mensagem ou anexe um arquivo." }, { status: 400 });
  }
  // A citação precisa apontar pra uma mensagem DESTE chamado.
  const replyTo = parsed.data.reply_to ?? null;
  if (replyTo) {
    const { count } = await session.supabase.from("ticket_messages")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", ticket.id).eq("id", replyTo);
    if (!count) return NextResponse.json({ error: "Mensagem citada inválida." }, { status: 400 });
  }

  const role = isAdmin ? "admin" : "user";
  const { data, error } = await session.supabase.from("ticket_messages").insert({
    ticket_id: ticket.id, sender_id: session.user.id, sender_role: role,
    mensagem: parsed.data.mensagem, reply_to: replyTo, anexos,
  }).select("id,sender_role,mensagem,anexos,reply_to,created_at").single();
  if (error) return NextResponse.json({ error: "Não foi possível enviar a mensagem." }, { status: 500 });

  // Resposta humana assume o chamado (a IA para de falar) e marca em andamento.
  if (isAdmin) {
    const upd: Record<string, string> = { atendente: "admin" };
    if (ticket.status === "aberto") upd.status = "em_andamento";
    await session.supabase.from("support_tickets").update(upd).eq("id", ticket.id);
    // Avisa o cliente na dashboard — 1 notificação não lida por vez,
    // mesmo que o admin mande várias mensagens seguidas.
    const adminDb = createSupabaseAdminClient();
    const { count } = await adminDb.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ticket.user_id).eq("tipo", "chamado_respondido").eq("lida", false);
    if (!count) {
      await adminDb.from("notifications").insert({
        user_id: ticket.user_id,
        tipo: "chamado_respondido",
        titulo: "Seu chamado foi respondido",
        corpo: `"${ticket.assunto.slice(0, 120)}" tem uma nova mensagem do suporte.`,
      });
    }
  } else if (ticket.atendente === "ia") {
    triggerSupportAgent(ticket.id);
  }
  return NextResponse.json({ mensagem: data }, { headers: { "Cache-Control": "no-store" } });
}
