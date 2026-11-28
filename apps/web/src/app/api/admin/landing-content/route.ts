import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { landingContentSchema } from "@/lib/landing-content";

const schema = z.object({ content: landingContentSchema, showcaseConsent: z.boolean() });

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
  const limit = await authRateLimit("admin-plan", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de salvar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revise os campos." }, { status: 400 });
  }
  if (parsed.data.content.showcase_slugs.length && !parsed.data.showcaseConsent) {
    return NextResponse.json({ error: "Confirme a autorização para exibir os sites." }, { status: 400 });
  }
  const { error } = await session.supabase.rpc("configure_landing_content", { p_value: parsed.data.content });
  if (error) {
    const message = error.code === "PGRST202"
      ? "A configuração da landing ainda precisa da migration 202611270000 no banco."
      : error.code === "22023"
        ? "Revise os vídeos e os sites: todos os exemplos precisam estar publicados."
        : "Não foi possível salvar a configuração. Tente novamente.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  revalidatePath("/");
  revalidatePath("/admin/landing");
  return NextResponse.json({ content: parsed.data.content }, { headers: { "Cache-Control": "no-store" } });
}
