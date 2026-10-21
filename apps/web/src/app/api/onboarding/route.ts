import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";

const schema = z.object({
  origem: z.string().trim().max(80).optional(),
  dificuldade: z.string().trim().max(120).optional(),
});

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) return NextResponse.json({ error: "Aguarde um instante." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const { error } = await session.supabase.rpc("save_onboarding_answers", { p_answers: parsed.data });
  if (error) return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
