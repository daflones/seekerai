import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { revalidatePath } from "next/cache";

// Slugs de planos e ids de pacotes ocultos na vitrine do cliente
// (/app/planos). Lista vazia = tudo visível.
const schema = z.object({
  plans: z.array(z.string().trim().min(1).max(40)).max(10),
  packs: z.array(z.string().trim().min(1).max(40)).max(20),
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
    return NextResponse.json({ error: "Revise os campos." }, { status: 400 });
  }

  const limit = await authRateLimit("admin-integration", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de salvar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const { error } = await session.supabase.rpc("configure_app_setting", {
    p_key: "checkout_hidden",
    p_value: { plans: parsed.data.plans, packs: parsed.data.packs },
    p_reason: parsed.data.motivo || "Visibilidade da vitrine de planos ajustada pelo painel.",
  });
  if (error) {
    return NextResponse.json({ error: "Não foi possível salvar a visibilidade." }, { status: 400 });
  }
  revalidatePath("/app/planos");
  return NextResponse.json({ message: "Visibilidade atualizada." },
    { headers: { "Cache-Control": "no-store" } });
}
