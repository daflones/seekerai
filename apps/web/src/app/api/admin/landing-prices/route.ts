import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { revalidatePath } from "next/cache";

const schema = z.object({
  show: z.boolean(),
  motivo: z.string().trim().max(300).optional().or(z.literal("")),
});

// Liga/desliga a vitrine de preços da landing (cards de plano, "a
// partir de" do hero, preço riscado no CTA final e JSON-LD). O app
// (checkout/planos) não é afetado — lá o preço sempre aparece.
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
    return NextResponse.json({ error: "Revise os campos." }, { status: 400 });
  }

  const limit = await authRateLimit("admin-plan", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de salvar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const { error } = await session.supabase.rpc("configure_app_setting", {
    p_key: "landing_show_prices",
    p_value: parsed.data.show,
    p_reason: parsed.data.motivo || `Preços da landing ${parsed.data.show ? "ativados" : "desativados"} pelo painel.`,
  });
  if (error) {
    return NextResponse.json({ error: "Não foi possível salvar a configuração." }, { status: 400 });
  }
  revalidatePath("/");
  return NextResponse.json({ show: parsed.data.show, message: "Salvo." },
    { headers: { "Cache-Control": "no-store" } });
}
