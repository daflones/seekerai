import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Lista de chamados para o painel admin (RLS já filtra por is_admin()).
export async function GET() {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }
  const { data: tickets, error } = await session.supabase
    .from("support_tickets")
    .select("id,assunto,categoria,prioridade,status,created_at,updated_at,user_id")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "Não foi possível listar os chamados." }, { status: 500 });

  const ids = (tickets ?? []).map((t) => t.user_id);
  const { data: profiles } = ids.length
    ? await session.supabase.from("profiles").select("id,nome").in("id", ids)
    : { data: [] };
  const nomes = new Map((profiles ?? []).map((p) => [p.id, p.nome]));

  return NextResponse.json(
    { tickets: (tickets ?? []).map((t) => ({ ...t, cliente: nomes.get(t.user_id) ?? "Cliente" })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const postSchema = z.object({
  userId: z.string().uuid(),
  mensagem: z.string().trim().min(1).max(4000),
});

// Admin inicia uma conversa direta com o usuário (lista de usuários →
// "Iniciar chat"). Vira um chamado conduzido pelo humano, com a primeira
// mensagem já registrada e notificação na dashboard do cliente.
export async function POST(request: NextRequest) {
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
  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um pouco." }, { status: 429 });
  }
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Escreva a primeira mensagem da conversa." }, { status: 400 });
  }
  const { userId, mensagem } = parsed.data;

  const admin = createSupabaseAdminClient();
  const { data: target } = await admin.from("profiles")
    .select("id").eq("id", userId).maybeSingle();
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  // support_tickets.mensagem exige 10+ caracteres — a primeira mensagem
  // real pode ser curta ("oi!"), então o campo guarda um resumo garantido.
  const resumo = mensagem.length >= 10 ? mensagem.slice(0, 4000)
    : `Mensagem do suporte: ${mensagem}`;
  const { data: ticket, error } = await admin.from("support_tickets").insert({
    user_id: userId,
    assunto: "Conversa com o suporte",
    categoria: "outro",
    prioridade: "normal",
    mensagem: resumo,
    status: "em_andamento",
    atendente: "admin",
  }).select("id").single();
  if (error || !ticket) {
    return NextResponse.json({ error: "Não foi possível iniciar a conversa." }, { status: 500 });
  }

  const { error: msgError } = await admin.from("ticket_messages").insert({
    ticket_id: ticket.id,
    sender_id: session.user.id,
    sender_role: "admin",
    mensagem,
  });
  if (msgError) {
    return NextResponse.json({ error: "Não foi possível enviar a mensagem." }, { status: 500 });
  }

  await admin.from("notifications").insert({
    user_id: userId,
    tipo: "chat_admin",
    titulo: "O suporte iniciou uma conversa com você",
    corpo: "Nossa equipe te chamou diretamente — responda em Suporte > Meus chamados.",
  });
  return NextResponse.json({ id: ticket.id }, { headers: { "Cache-Control": "no-store" } });
}
