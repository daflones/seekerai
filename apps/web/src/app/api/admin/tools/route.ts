import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabasePublicConfig } from "@/lib/auth/config";
import { triggerSupportAgent } from "@/lib/support/agent";

// Ferramentas de teste do painel admin. Allowlist fechada: só sondagens
// de leitura, os dois sweeps de manutenção e um teste vivo do agente de
// suporte (cria+apaga um chamado do próprio admin).
const schema = z.object({
  tool: z.enum([
    "ping-db", "jobs-scan", "ticket-scan", "ledger-scan", "queue-health",
    "sweep-support", "expire-sites", "agent-ping", "agent-live",
  ]),
});

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const session = await verifiedSession();
  if (!session || session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Somente admin." }, { status: 403 });
  }
  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) return NextResponse.json({ error: "Aguarde antes de testar de novo." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ferramenta desconhecida." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const started = Date.now();
  const done = (result: unknown) =>
    NextResponse.json({ tool: parsed.data.tool, ms: Date.now() - started, result },
      { headers: { "Cache-Control": "no-store" } });

  switch (parsed.data.tool) {
    case "ping-db": {
      const { count, error } = await admin.from("profiles")
        .select("id", { count: "exact", head: true });
      return done({ ok: !error, profiles: count ?? null, error: error?.message ?? null });
    }
    case "jobs-scan": {
      const [{ data: sj }, { data: aj }] = await Promise.all([
        admin.from("search_jobs").select("status").limit(2000),
        admin.from("ai_jobs").select("status").limit(2000),
      ]);
      const tally = (rows: { status: string }[] | null) =>
        (rows ?? []).reduce<Record<string, number>>((a, r) => {
          a[r.status] = (a[r.status] ?? 0) + 1; return a;
        }, {});
      return done({ search_jobs: tally(sj), ai_jobs: tally(aj) });
    }
    case "ticket-scan": {
      const { data: tickets } = await admin.from("support_tickets")
        .select("id,status,atendente").limit(500);
      const byStatus: Record<string, number> = {};
      const byAtt: Record<string, number> = {};
      let waitingOnUser = 0;
      for (const t of tickets ?? []) {
        byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
        byAtt[t.atendente] = (byAtt[t.atendente] ?? 0) + 1;
        if (["aberto", "em_andamento", "pendente"].includes(t.status)) {
          const { data: last } = await admin.from("ticket_messages")
            .select("sender_role").eq("ticket_id", t.id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (last?.sender_role !== "user") waitingOnUser += 1;
        }
      }
      return done({ by_status: byStatus, by_atendente: byAtt, open_waiting_on_user: waitingOnUser });
    }
    case "ledger-scan": {
      const [{ count: reserved }, { count: refunded }, { count: completed }] = await Promise.all([
        admin.from("credit_operations").select("id", { count: "exact", head: true }).eq("status", "reserved"),
        admin.from("credit_operations").select("id", { count: "exact", head: true }).eq("status", "refunded"),
        admin.from("credit_operations").select("id", { count: "exact", head: true }).eq("status", "completed"),
      ]);
      return done({ reserved_stuck: reserved ?? 0, refunded: refunded ?? 0, completed: completed ?? 0 });
    }
    case "queue-health": {
      const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const [{ data: sj }, { data: aj }] = await Promise.all([
        admin.from("search_jobs").select("id,created_at").eq("status", "running").limit(200),
        admin.from("ai_jobs").select("id,created_at").eq("status", "running").limit(200),
      ]);
      const stuckS = (sj ?? []).filter((j) => j.created_at < stale).length;
      const stuckA = (aj ?? []).filter((j) => j.created_at < stale).length;
      return done({
        search_running: (sj ?? []).length, search_stuck_10m: stuckS,
        ai_running: (aj ?? []).length, ai_stuck_10m: stuckA,
      });
    }
    case "sweep-support": {
      const { data, error } = await admin.rpc("close_stale_tickets", { p_hours: 72 });
      return done({ ok: !error, expired: typeof data === "number" ? data : 0, error: error?.message ?? null });
    }
    case "expire-sites": {
      const { data, error } = await admin.rpc("expire_lead_sites");
      return done({ ok: !error, expired: typeof data === "number" ? data : null, error: error?.message ?? null });
    }
    case "agent-ping": {
      const config = supabasePublicConfig();
      const key = process.env.INTERNAL_CRON_SECRET;
      if (!config || !key) return done({ ok: false, error: "config ausente" });
      const res = await fetch(`${config.url}/functions/v1/support-agent`, {
        method: "POST",
        headers: { "x-internal-key": key, apikey: config.key, "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: "00000000-0000-0000-0000-000000000000" }),
        signal: AbortSignal.timeout(30_000),
      }).catch((e) => ({ ok: false, status: 0, error: String(e) }) as never);
      const text = res.ok === false ? "" : await res.text().catch(() => "");
      return done({ ok: res.status === 200, http: res.status, body: text.slice(0, 200) });
    }
    case "agent-live": {
      const { data: ticket, error } = await admin.from("support_tickets").insert({
        user_id: session.user.id, assunto: "Teste vivo do agente (admin)",
        categoria: "tecnico", prioridade: "baixa",
        mensagem: "Quanto custa uma busca de leads em créditos? Responda em uma frase.",
        status: "aberto", atendente: "ia",
      }).select("id").single();
      if (error || !ticket) return done({ ok: false, error: error?.message ?? "insert falhou" });
      await admin.from("ticket_messages").insert({
        ticket_id: ticket.id, sender_id: session.user.id, sender_role: "user",
        mensagem: "Quanto custa uma busca de leads em créditos? Responda em uma frase.",
      });
      triggerSupportAgent(ticket.id);
      let iaMsg: string | null = null;
      let ticketState: Record<string, unknown> | null = null;
      const deadline = Date.now() + 75_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const { data: m } = await admin.from("ticket_messages")
          .select("mensagem").eq("ticket_id", ticket.id).eq("sender_role", "ia")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (m?.mensagem) { iaMsg = m.mensagem; break; }
      }
      const { data: tk } = await admin.from("support_tickets")
        .select("status,atendente").eq("id", ticket.id).single();
      ticketState = tk ?? null;
      await admin.from("ticket_messages").delete().eq("ticket_id", ticket.id);
      await admin.from("support_tickets").delete().eq("id", ticket.id);
      return done({ ok: iaMsg !== null, ia_reply: iaMsg, ticket: ticketState });
    }
  }
}
