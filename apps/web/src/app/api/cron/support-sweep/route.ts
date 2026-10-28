import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { triggerSupportAgent } from "@/lib/support/agent";

// Varredura do suporte por IA (agendar ~a cada 5min):
// - reprocessa chamados sob a IA cuja última mensagem é do cliente (falha de trigger)
// - expira chamados sem resposta do cliente há 72h
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

  const { data: closed } = await admin.rpc("close_stale_tickets", { p_hours: 72 });
  return NextResponse.json({ reprocessed, expired: typeof closed === "number" ? closed : 0 });
}
