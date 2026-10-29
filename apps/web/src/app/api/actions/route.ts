import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { supabasePublicConfig } from "@/lib/auth/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refundCreditAction } from "@/lib/billing/refund";

// Proxy autenticado para as edge functions que exigem o JWT do usuário.
// O token nunca chega ao cliente: o servidor repassa a sessão validada.
const bodySchema = z.object({
  funcao: z.enum(["places-search", "ai-generate", "whatsapp-check", "billing-checkout"]),
  payload: z.record(z.string(), z.unknown()),
});

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const session = await verifiedSession();
  if (!session) {
    return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  }
  const profile = session.profile;
  if (!profile?.consentimento_em || !profile.onboarding_concluido) {
    return NextResponse.json({ error: "Conclua seu cadastro antes." }, { status: 403 });
  }

  const raw = await request.text().catch(() => "");
  if (raw.length > 65_536) {
    return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos." }, { status: 400 });
  }

  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Aguarde antes de tentar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // Busca real: assinatura ativa ou saldo (créditos de boas-vindas
  // liberam o trial — a edge cobra 4 créditos por busca).
  // Admin (donos) burla para replay/testes.
  if (parsed.data.funcao === "places-search" && profile.role !== "admin") {
    const { data: sub } = await session.supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", session.user.id)
      .in("status", ["active"])
      .maybeSingle();
    if (!sub) {
      const { data: wallet } = await session.supabase
        .from("credit_wallets")
        .select("saldo")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!wallet || wallet.saldo <= 0) {
        return NextResponse.json(
          { error: "Créditos insuficientes — seus créditos grátis acabaram. Assine um plano para continuar usando o radar." },
          { status: 403 },
        );
      }
    }
  }

  const { data: { session: authSession } } = await session.supabase.auth.getSession();
  const token = authSession?.access_token;
  const config = supabasePublicConfig();
  if (!token || !config) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  const upstream = await fetch(`${config.url}/functions/v1/${parsed.data.funcao}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: config.key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsed.data.payload),
    signal: AbortSignal.timeout(150_000),
  }).catch(() => null);
  // Edge sem resposta ou falhou: se ela morreu antes de liquidar a reserva,
  // devolve os créditos aqui (a RPC só age em operações 'reserved').
  const requestRef = typeof parsed.data.payload.requestRef === "string"
    ? parsed.data.payload.requestRef : null;
  const chargeable = parsed.data.funcao === "ai-generate" || parsed.data.funcao === "places-search";
  if (!upstream) {
    if (chargeable) {
      await refundCreditAction(createSupabaseAdminClient(), session.user.id, requestRef);
    }
    return NextResponse.json({ error: "Serviço indisponível no momento." }, { status: 502 });
  }

  const text = await upstream.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { /* repassa como erro genérico abaixo */ }
  if (!upstream.ok) {
    if (chargeable) {
      await refundCreditAction(createSupabaseAdminClient(), session.user.id, requestRef);
    }
    const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const raw = obj?.error ?? obj?.erro;
    const message = typeof raw === "string" && raw ? raw : "A ação não pôde ser concluída.";
    return NextResponse.json({ error: message }, { status: upstream.status });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
