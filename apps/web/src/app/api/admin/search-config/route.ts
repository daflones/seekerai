import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { LEAD_SEARCH_DEFAULTS, type LeadSearchConfig } from "@/lib/lead-search-config";

const target = z.number().int().min(5).max(200);
const schema = z.object({
  targets: z.object({
    default: target,
    essencial: target,
    pro: target,
    king: target,
  }),
  pool_multiplier: z.number().min(1).max(4),
  smart_filter: z.boolean(),
  expand_rounds: z.number().int().min(0).max(4),
  expand_radius_km: z.number().min(5).max(100),
  fallback_site_ok: z.boolean(),
  motivo: z.string().trim().max(300).optional().or(z.literal("")),
});

async function requireAdmin() {
  const session = await verifiedSession();
  if (!session) return { error: NextResponse.json({ error: "Entre novamente." }, { status: 401 }) };
  if (session.profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { data } = await session.supabase.from("app_settings")
    .select("value").eq("key", "lead_search").maybeSingle();
  const raw = (data?.value ?? {}) as Record<string, unknown>;
  const merged = { ...LEAD_SEARCH_DEFAULTS, ...raw } as LeadSearchConfig;
  return NextResponse.json({ config: merged }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const { session, error: authError } = await requireAdmin();
  if (authError) return authError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos." }, { status: 400 });
  }

  const limit = await authRateLimit("admin-integration", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de salvar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const { motivo, ...config } = parsed.data;
  const { error } = await session.supabase.rpc("configure_app_setting", {
    p_key: "lead_search",
    p_value: config,
    p_reason: motivo || "Busca de leads ajustada pelo painel.",
  });
  if (error) {
    return NextResponse.json({ error: "Não foi possível salvar a configuração." }, { status: 400 });
  }
  return NextResponse.json({ message: "Configuração da busca atualizada." },
    { headers: { "Cache-Control": "no-store" } });
}
