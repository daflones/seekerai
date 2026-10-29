import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { expireSupportTicket, triggerSupportAgent } from "@/lib/support/agent";

// Varredura do suporte por IA (agendar ~a cada 5min):
// - reprocessa chamados sob a IA cuja última mensagem é do cliente (falha de trigger)
// - expira chamados da IA parados há >20min (resumo cordial gerado pela IA)
// - fallback de 72h pra chamados sob o admin sem resposta do cliente
export async function GET(request: NextRequest) {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret || request.headers.get("x-internal-key") !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();

  const { data: pending } = await admin.from("support_tickets")
    .select("id")
    .eq("atendente", "ia")
    .in("status", ["aberto", "em_andamento", "pendente"])
    .order("updated_at", { ascending: false })
    .limit(30);

  let reprocessed = 0;
  const cutoff = new Date(Date.now() - 90_000).toISOString();
  for (const t of pending ?? []) {
    const { data: last } = await admin.from("ticket_messages")
      .select("sender_role,created_at")
      .eq("ticket_id", t.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.sender_role === "user" && last.created_at < cutoff) {
      triggerSupportAgent(t.id);
      reprocessed += 1;
      if (reprocessed >= 10) break;
    }
  }

  // Expiração rápida: chamados sob a IA sem atualização há >20min.
  // A edge gera um resumo cordial do atendimento e marca 'expirado'.
  // Chamado com a última mensagem do cliente NUNCA é expirado aqui —
  // ele entra no reprocessamento acima (a IA ainda deve responder).
  const expireCutoff = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: staleIa } = await admin.from("support_tickets")
    .select("id")
    .eq("atendente", "ia")
    .in("status", ["aberto", "em_andamento", "pendente"])
    .lt("updated_at", expireCutoff)
    .order("updated_at", { ascending: true })
    .limit(10);

  let expired = 0;
  for (const t of staleIa ?? []) {
    const { data: last } = await admin.from("ticket_messages")
      .select("sender_role,created_at")
      .eq("ticket_id", t.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last || last.sender_role === "user" || last.created_at > expireCutoff) continue;
    if (await expireSupportTicket(t.id)) expired += 1;
    if (expired >= 5) break;
  }

  const { data: closed } = await admin.rpc("close_stale_tickets", { p_hours: 72 });
  return NextResponse.json({
    reprocessed,
    expired,
    expired72h: typeof closed === "number" ? closed : 0,
  });
}
