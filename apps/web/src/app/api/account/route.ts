import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  nome: z.string().trim().min(2, "Informe um nome válido.").max(60),
});

async function guard(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return { error: NextResponse.json({ error: "Origem não permitida." }, { status: 403 }) };
  }
  const session = await verifiedSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Entre novamente." }, { status: 401 }) };
  }
  return { session };
}

/** Atualiza o nome de exibição (RLS limita à própria linha). */
export async function PATCH(request: NextRequest) {
  const ctx = await guard(request);
  if (ctx.error) return ctx.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const { error } = await ctx.session!.supabase.from("profiles")
    .update({ nome: parsed.data.nome }).eq("id", ctx.session!.user.id);
  if (error) {
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Exclui a conta de verdade: remove o usuário do auth — todas as tabelas
 * com user_id fazem cascade (leads, sites, créditos, assinaturas, tickets…).
 */
export async function DELETE(request: NextRequest) {
  const ctx = await guard(request);
  if (ctx.error) return ctx.error;
  const session = ctx.session!;
  const limit = await authRateLimit("account-delete", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de tentar de novo." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(session.user.id);
  if (error) {
    return NextResponse.json({ error: "Não foi possível excluir agora." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
