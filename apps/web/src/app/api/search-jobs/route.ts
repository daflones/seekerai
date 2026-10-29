import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { supabasePublicConfig } from "@/lib/auth/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refundCreditAction } from "@/lib/billing/refund";

// Jobs de busca: a chamada à edge roda no servidor em background,
// então trocar de aba ou sair da página não cancela o radar.
const bodySchema = z.object({
  query: z.string().trim().min(2).max(300),
  serviceSlug: z.string().regex(/^[a-z0-9_]{1,60}$/),
  requestRef: z.string().min(8).max(150),
  regionCode: z.string().max(2).default("BR"),
});

async function runJob(jobId: string, userId: string, token: string, payload: z.infer<typeof bodySchema>) {
  const admin = createSupabaseAdminClient();
  const config = supabasePublicConfig();
  try {
    const upstream = await fetch(`${config!.url}/functions/v1/places-search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: config!.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, jobId }),
      signal: AbortSignal.timeout(240_000),
    });
    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    if (!upstream.ok) {
      const erro = typeof data.erro === "string" ? data.erro
        : typeof data.error === "string" ? data.error : "A busca não pôde ser concluída.";
      await admin.from("search_jobs")
        .update({ status: "error", erro, updated_at: new Date().toISOString() })
        .eq("id", jobId).eq("user_id", userId);
      await refundCreditAction(admin, userId, payload.requestRef);
      return;
    }
    await admin.from("search_jobs")
      .update({ status: "done", result: data, progresso: 100, etapa: "Concluída", updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("user_id", userId);
  } catch {
    await admin.from("search_jobs")
      .update({ status: "error", erro: "Serviço indisponível no momento.", updated_at: new Date().toISOString() })
      .eq("id", jobId).eq("user_id", userId)
      .then(() => {}, () => {});
    await refundCreditAction(admin, userId, payload.requestRef);
  }
}

const STALE_MS = 6 * 60_000;

function stale(job: { status: string; created_at: string }) {
  return job.status === "running" && Date.now() - new Date(job.created_at).getTime() > STALE_MS;
}

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const latest = request.nextUrl.searchParams.get("latest");
  if (latest) {
    const { data } = await session.supabase.from("search_jobs")
      .select("id,status,payload,result,erro,created_at")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data && stale(data)) {
      const admin = createSupabaseAdminClient();
      const erro = "A busca demorou demais e expirou. Tente novamente.";
      await admin.from("search_jobs")
        .update({ status: "error", erro, updated_at: new Date().toISOString() })
        .eq("id", data.id).eq("status", "running");
      const ref = (data.payload as { requestRef?: string } | null)?.requestRef;
      await refundCreditAction(admin, session.user.id, ref);
      return NextResponse.json({ job: { ...data, status: "error", erro } },
        { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ job: data ?? null }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Parâmetro inválido." }, { status: 400 });
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const profile = session.profile;
  if (!profile?.consentimento_em || !profile.onboarding_concluido) {
    return NextResponse.json({ error: "Conclua seu cadastro antes." }, { status: 403 });
  }
  // Busca real: assinatura ativa ou saldo (créditos de boas-vindas
  // liberam o trial). Sem saldo a edge nem é chamada — aqui já devolve
  // erro de créditos pra UI mostrar o upsell "Gostou? Assine!".
  // Admin burla (replay/testes).
  if (profile.role !== "admin") {
    const { data: sub } = await session.supabase.from("subscriptions").select("status")
      .eq("user_id", session.user.id).eq("status", "active").maybeSingle();
    if (!sub) {
      // Tenta renovar a cota diária antes de barrar por saldo.
      await session.supabase.rpc("claim_daily_credits");
      const { data: wallet } = await session.supabase.from("credit_wallets")
        .select("saldo").eq("user_id", session.user.id).maybeSingle();
      if (!wallet || wallet.saldo <= 0) {
        return NextResponse.json(
          { error: "Créditos insuficientes — seus créditos grátis de hoje acabaram e voltam amanhã. Assine um plano para continuar agora." },
          { status: 403 },
        );
      }
    }
  }

  const raw = await request.text().catch(() => "");
  if (raw.length > 4_096) return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(value);
  if (!parsed.success) return NextResponse.json({ error: "Revise os campos." }, { status: 400 });

  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de tentar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const { data: { session: authSession } } = await session.supabase.auth.getSession();
  const token = authSession?.access_token;
  if (!token || !supabasePublicConfig()) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  // Um job por vez por usuário: se já existe um rodando, devolve ele.
  // "Running" velho é órfão — expira e deixa a nova busca passar.
  const admin = createSupabaseAdminClient();
  const { data: running } = await admin.from("search_jobs")
    .select("id,created_at,payload").eq("user_id", session.user.id).eq("status", "running")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (running && !stale({ status: "running", created_at: running.created_at })) {
    return NextResponse.json({ jobId: running.id, resumed: true });
  }
  if (running) {
    await admin.from("search_jobs")
      .update({ status: "error", erro: "A busca demorou demais e expirou.", updated_at: new Date().toISOString() })
      .eq("id", running.id).eq("status", "running");
    const ref = (running.payload as { requestRef?: string } | null)?.requestRef;
    await refundCreditAction(admin, session.user.id, ref);
  }

  const { data: job, error } = await admin.from("search_jobs")
    .insert({ user_id: session.user.id, payload: parsed.data })
    .select("id").single();
  if (error || !job) {
    return NextResponse.json({ error: "Não foi possível iniciar a busca." }, { status: 400 });
  }

  // Detached: continua rodando no servidor mesmo se o cliente sair da página.
  void runJob(job.id, session.user.id, token, parsed.data);
  return NextResponse.json({ jobId: job.id }, { headers: { "Cache-Control": "no-store" } });
}
