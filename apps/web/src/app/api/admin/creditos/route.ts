import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";

const reason = z.string().trim().min(5, "Descreva o motivo (5-300).").max(300);
const schema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("plano-creditos"),
    planId: z.string().uuid(),
    creditos: z.number().int().min(0).max(1_000_000),
    motivo: reason,
  }),
  z.object({
    acao: z.literal("welcome-creditos"),
    creditos: z.number().int().min(0).max(1_000_000),
    motivo: reason,
  }),
  z.object({
    acao: z.literal("custo-acao"),
    action: z.string().regex(/^[a-z_]{2,60}$/),
    cost: z.number().int().min(0).max(1_000_000).nullable(),
    enabled: z.boolean(),
    motivo: reason,
  }),
]);

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

  const raw = await request.text().catch(() => "");
  if (raw.length > 8_192) return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Revise os campos." }, { status: 400 });
  }

  const limit = await authRateLimit("admin-integration", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de salvar novamente." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const body = parsed.data;
  const { error } = body.acao === "plano-creditos"
    ? await session.supabase.rpc("configure_plan_credits", {
        p_plan: body.planId, p_credits: body.creditos, p_reason: body.motivo,
      })
    : body.acao === "welcome-creditos"
      ? await session.supabase.rpc("configure_welcome_credits", {
          p_credits: body.creditos, p_reason: body.motivo,
        })
      : await session.supabase.rpc("configure_credit_action", {
          p_action: body.action, p_cost: body.cost, p_enabled: body.enabled, p_reason: body.motivo,
        });

  if (error) return NextResponse.json({ error: "Não foi possível salvar." }, { status: 400 });
  return NextResponse.json({ message: "Regra atualizada e registrada na auditoria." },
    { headers: { "Cache-Control": "no-store" } });
}
