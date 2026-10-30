import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { planEditSchema } from "@/lib/plans/model";

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  try {
    const session = await verifiedSession();
    if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
    if (!session.profile || session.profile.role !== "admin") return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
    const reader = request.body?.getReader();
    let size = 0;
    let body = "";
    const decoder = new TextDecoder();
    if (reader) for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32_768) { await reader.cancel(); return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 }); }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    let value: unknown;
    try { value = JSON.parse(body); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
    const parsed = planEditSchema.safeParse(value);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Revise os campos." }, { status: 400 });
    const limit = await authRateLimit("admin-plan", session.user.id, request.headers);
    if (!limit.allowed) return NextResponse.json({ error: "Aguarde antes de salvar novamente." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    const plan = parsed.data;
    const { error } = await session.supabase.rpc("configure_plan_card", {
      p_plan: plan.id, p_name: plan.name, p_price: plan.priceCents, p_order: plan.order,
      p_featured: plan.featured, p_visible: plan.visible, p_content: plan.content,
      p_revision: plan.revision, p_reason: plan.reason,
    });
    if (error?.code === "40001") return NextResponse.json({ error: "Este card foi alterado em outra sessão. Recarregue antes de salvar." }, { status: 409 });
    if (error) return NextResponse.json({ error: "Não foi possível salvar. Verifique os dados e tente novamente." }, { status: 400 });
    revalidatePath("/");
    revalidatePath("/cadastro");
    revalidatePath("/admin/planos");
    return NextResponse.json({ revision: plan.revision + 1, message: "Plano e card atualizados." }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Serviço indisponível. Tente novamente." }, { status: 500 }); }
}
