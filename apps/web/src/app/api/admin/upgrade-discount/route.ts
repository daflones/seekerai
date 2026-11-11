import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { revalidatePath } from "next/cache";

// Desconto de upgrade por transição "de:para" → % (0-90).
// Ex.: {"essencial:pro":50,"essencial:king":25,"pro:king":50}
const schema = z.object({
  discounts: z.record(
    z.string().regex(/^[a-z0-9_-]{2,40}:[a-z0-9_-]{2,40}$/),
    z.number().int().min(0).max(90),
  ),
  motivo: z.string().trim().max(300).optional().or(z.literal("")),
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
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os percentuais (0–90, número inteiro)." }, { status: 400 });
  }

  const limit = await authRateLimit("admin-integration", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de salvar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const { error } = await session.supabase.rpc("configure_app_setting", {
    p_key: "upgrade_discounts",
    p_value: parsed.data.discounts,
    p_reason: parsed.data.motivo || "Descontos de upgrade ajustados pelo painel.",
  });
  if (error) {
    return NextResponse.json({ error: "Não foi possível salvar os descontos." }, { status: 400 });
  }
  revalidatePath("/app/planos");
  return NextResponse.json({ message: "Descontos de upgrade atualizados." },
    { headers: { "Cache-Control": "no-store" } });
}
