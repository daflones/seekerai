import { NextResponse } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_plan"), userId: z.string().uuid(), planSlug: z.string().min(1).max(60) }),
  z.object({ action: z.literal("cancel_sub"), userId: z.string().uuid() }),
  z.object({
    action: z.literal("adjust_credits"),
    userId: z.string().uuid(),
    delta: z.number().int().min(-100000).max(100000).refine((v) => v !== 0, "Delta deve ser diferente de zero"),
    motivo: z.string().trim().min(3).max(200).default("Ajuste manual do administrador"),
  }),
]);

async function requireAdmin() {
  const session = await verifiedSession();
  if (!session) return { error: NextResponse.json({ error: "Entre novamente." }, { status: 401 }) };
  if (session.profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 }) };
  }
  return { session };
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const { userId, action } = parsed.data;
  const admin = createSupabaseAdminClient();

  if (action === "set_plan") {
    const { data: plan } = await admin.from("plans").select("id,slug,nome,creditos_mensais").eq("slug", parsed.data.planSlug).single();
    if (!plan) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
    const { data: active } = await admin.from("subscriptions")
      .select("id").eq("user_id", userId).eq("status", "active").maybeSingle();
    let subId: string;
    if (active) {
      const { error } = await admin.from("subscriptions").update({ plan_id: plan.id }).eq("id", active.id);
      if (error) return NextResponse.json({ error: "Falha ao trocar o plano." }, { status: 500 });
      subId = active.id;
    } else {
      const { data: created, error } = await admin.from("subscriptions").insert({
        user_id: userId, plan_id: plan.id, provider: "admin", status: "active",
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      }).select("id").single();
      if (error || !created) return NextResponse.json({ error: "Falha ao criar a assinatura." }, { status: 500 });
      subId = created.id;
    }
    // Repõe a cota do plano (zera e aplica os créditos mensais).
    const ciclo = new Date().toISOString().slice(0, 7);
    const { error: grantErr } = await admin.rpc("grant_plan_allowance", {
      p_user: userId, p_plan: plan.id, p_cycle_ref: `admin:${subId}:${ciclo}`,
    });
    if (grantErr) return NextResponse.json({ error: "Plano aplicado, mas a cota falhou: " + grantErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, plano: plan.nome });
  }

  if (action === "cancel_sub") {
    const { error, count } = await admin.from("subscriptions")
      .update({ status: "canceled", cancel_at_period_end: false }, { count: "exact" })
      .eq("user_id", userId).eq("status", "active");
    if (error) return NextResponse.json({ error: "Falha ao cancelar." }, { status: 500 });
    if (!count) return NextResponse.json({ error: "Usuário não tem assinatura ativa." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // adjust_credits — via ledger (saldo_apos + motivo + ref idempotente).
  const ref = `admin:adj:${crypto.randomUUID()}`;
  const { data: saldo, error } = await admin.rpc("apply_credit_delta", {
    p_user: userId, p_delta: parsed.data.delta, p_motivo: `Admin: ${parsed.data.motivo}`, p_ref: ref,
  });
  if (error) {
    const msg = error.message.includes("Insufficient") ? "Saldo ficaria negativo." : "Falha ao ajustar créditos.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, saldo });
}
