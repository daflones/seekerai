import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { supabasePublicConfig } from "@/lib/auth/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refundCreditAction } from "@/lib/billing/refund";

// Geração pesada (site completo) roda detached: a edge pode demorar minutos
// quando o provedor principal falha e o fallback gratuito assume. O cliente
// faz polling — sair da página não mata a geração.
const bodySchema = z.object({
  leadId: z.string().uuid(),
  tipo: z.literal("generate_site"),
  serviceSlug: z.string().regex(/^[a-z0-9_]{1,60}$/),
  requestRef: z.string().min(8).max(150),
  prompt: z.string().min(10).max(20_000),
  lang: z.enum(["pt", "en", "es", "fr", "de", "it"]).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

// Site + fallback lento: orçamento grande de propósito. A edge tem ~400s.
const EDGE_TIMEOUT_MS = 390_000;

function slugify(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "site";
}

async function runJob(jobId: string, leadId: string, userId: string, token: string, payload: z.infer<typeof bodySchema>) {
  const admin = createSupabaseAdminClient();
  const config = supabasePublicConfig();
  try {
    const upstream = await fetch(`${config!.url}/functions/v1/ai-generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: config!.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: payload.tipo,
        serviceSlug: payload.serviceSlug,
        businessRef: leadId,
        requestRef: payload.requestRef,
        lang: payload.lang ?? "pt",
        prompt: payload.prompt,
        context: payload.context ?? {},
      }),
      signal: AbortSignal.timeout(EDGE_TIMEOUT_MS),
    });
    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    if (!upstream.ok || typeof data.conteudo !== "string" || !data.conteudo) {
      const erro = typeof data.erro === "string" ? data.erro
        : typeof data.error === "string" ? data.error
        : "A geração não pôde ser concluída. Tente novamente.";
      await admin.from("ai_jobs")
        .update({ status: "error", erro, updated_at: new Date().toISOString() })
        .eq("id", jobId);
      await refundCreditAction(admin, userId, payload.requestRef);
      return;
    }
    // Grava o output direto no lead — se o usuário já saiu, o site está lá quando voltar.
    await admin.from("lead_outputs").insert({
      lead_id: leadId, user_id: userId, tipo: payload.tipo,
      conteudo: data.conteudo, modelo: typeof data.modelo === "string" ? data.modelo : null,
    });
    // Site premium publicado pela edge: url/slug pra UI oferecer o link direto.
    const siteSlug = typeof data.siteSlug === "string" ? data.siteSlug : null;
    const siteUrl = typeof data.siteUrl === "string" ? data.siteUrl : null;
    // Garante slug público pro site gerado (/site/<slug>).
    const { data: leadRow } = await admin.from("leads")
      .select("nome,cidade,bairro,dados").eq("id", leadId).maybeSingle();
    const dados = (leadRow?.dados ?? {}) as Record<string, unknown>;
    if (leadRow && !dados.siteSlug) {
      const base = slugify([leadRow.nome, leadRow.bairro ?? leadRow.cidade].filter(Boolean).join(" "));
      let slug = base;
      for (let i = 2; i < 20; i++) {
        const { data: clash } = await admin.from("leads")
          .select("id").eq("dados->>siteSlug", slug).maybeSingle();
        if (!clash) break;
        slug = `${base}-${i}`;
      }
      await admin.from("leads").update({ dados: { ...dados, siteSlug: slug } }).eq("id", leadId);
    }
    await admin.from("ai_jobs")
      .update({ status: "done", result: { modelo: data.modelo ?? null, siteSlug, siteUrl }, updated_at: new Date().toISOString() })
      .eq("id", jobId);
  } catch {
    await admin.from("ai_jobs")
      .update({ status: "error", erro: "A geração demorou demais ou o serviço está indisponível.", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .then(() => {}, () => {});
    await refundCreditAction(admin, userId, payload.requestRef);
  }
}

const STALE_MS = 8 * 60_000;

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const leadId = request.nextUrl.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "Parâmetro inválido." }, { status: 400 });
  const { data } = await session.supabase.from("ai_jobs")
    .select("id,status,lead_id,result,erro,created_at,request_ref")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (data?.status === "running" && Date.now() - new Date(data.created_at).getTime() > STALE_MS) {
    const admin = createSupabaseAdminClient();
    const erro = "A geração expirou. Tente novamente.";
    await admin.from("ai_jobs")
      .update({ status: "error", erro, updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("status", "running");
    await refundCreditAction(admin, session.user.id, data.request_ref);
    return NextResponse.json({ job: { ...data, status: "error", erro } },
      { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ job: data ?? null }, { headers: { "Cache-Control": "no-store" } });
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

  const raw = await request.text().catch(() => "");
  if (raw.length > 32_000) return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
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

  // O lead precisa ser do usuário.
  const { data: lead } = await session.supabase.from("leads")
    .select("id").eq("id", parsed.data.leadId).eq("user_id", session.user.id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const { data: { session: authSession } } = await session.supabase.auth.getSession();
  const token = authSession?.access_token;
  if (!token || !supabasePublicConfig()) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  // Uma geração por vez por lead.
  const admin = createSupabaseAdminClient();
  const { data: running } = await admin.from("ai_jobs")
    .select("id,created_at").eq("lead_id", parsed.data.leadId).eq("status", "running")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (running && Date.now() - new Date(running.created_at).getTime() <= STALE_MS) {
    return NextResponse.json({ jobId: running.id, resumed: true });
  }

  const { data: job, error } = await admin.from("ai_jobs")
    .insert({ user_id: session.user.id, lead_id: parsed.data.leadId, tipo: parsed.data.tipo, request_ref: parsed.data.requestRef })
    .select("id").single();
  if (error || !job) {
    return NextResponse.json({ error: "Não foi possível iniciar a geração." }, { status: 400 });
  }

  void runJob(job.id, parsed.data.leadId, session.user.id, token, parsed.data);
  return NextResponse.json({ jobId: job.id }, { headers: { "Cache-Control": "no-store" } });
}
