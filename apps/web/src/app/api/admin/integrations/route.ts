import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { encryptSecret } from "@/lib/security/encryption";

const secretName = z.string().regex(/^[A-Z][A-Z0-9_]{1,60}$/, "Nome inválido.");
const reason = z.string().trim().min(5, "Descreva o motivo (5-300).").max(300);
const mutationSchema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("definir-secret"),
    nome: secretName,
    valor: z.string().min(1, "Informe o valor.").max(2000),
    motivo: reason,
  }),
  z.object({
    acao: z.literal("remover-secret"),
    nome: secretName,
    motivo: reason,
  }),
  z.object({
    acao: z.literal("definir-setting"),
    chave: z.literal("search_provider"),
    valor: z.enum(["google_places", "apify"]),
    motivo: reason,
  }),
]);

async function requireAdmin() {
  const session = await verifiedSession();
  if (!session) return { error: NextResponse.json({ error: "Entre novamente." }, { status: 401 }) };
  if (!session.profile || session.profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const [secrets, settings] = await Promise.all([
    session.supabase.rpc("list_integration_secrets"),
    session.supabase.from("app_settings").select("key,value"),
  ]);
  if (secrets.error) return NextResponse.json({ error: "Não foi possível listar integrações." }, { status: 500 });
  return NextResponse.json(
    { secrets: secrets.data ?? [], settings: settings.data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
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

  const raw = await request.text().catch(() => "");
  if (raw.length > 16_384) return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = mutationSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Revise os campos." }, { status: 400 });
  }

  const limit = await authRateLimit("admin-integration", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de salvar novamente." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const body = parsed.data;
  if (body.acao === "definir-secret") {
    let encrypted: string;
    try {
      encrypted = encryptSecret(body.valor, `edge:${body.nome}`);
    } catch {
      return NextResponse.json({ error: "Falha na criptografia. Verifique APP_ENCRYPTION_KEY." }, { status: 500 });
    }
    const { error } = await session.supabase.rpc("upsert_integration_secret", {
      p_provedor: "edge",
      p_nome: body.nome,
      p_encrypted: encrypted,
      p_ultimos4: body.valor.slice(-4),
      p_reason: body.motivo,
    });
    if (error) return NextResponse.json({ error: "Não foi possível salvar a chave." }, { status: 400 });
    return NextResponse.json({ message: `${body.nome} atualizada.` }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.acao === "remover-secret") {
    const { error } = await session.supabase.rpc("delete_integration_secret", {
      p_provedor: "edge",
      p_nome: body.nome,
      p_reason: body.motivo,
    });
    if (error) return NextResponse.json({ error: "Não foi possível remover." }, { status: 400 });
    return NextResponse.json({ message: `${body.nome} removida.` }, { headers: { "Cache-Control": "no-store" } });
  }

  const { error } = await session.supabase.rpc("configure_app_setting", {
    p_key: body.chave,
    p_value: body.valor,
    p_reason: body.motivo,
  });
  if (error) return NextResponse.json({ error: "Não foi possível salvar a configuração." }, { status: 400 });
  return NextResponse.json({ message: "Configuração atualizada." }, { headers: { "Cache-Control": "no-store" } });
}
