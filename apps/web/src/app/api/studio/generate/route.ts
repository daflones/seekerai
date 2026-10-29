import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { supabasePublicConfig } from "@/lib/auth/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refundCreditAction } from "@/lib/billing/refund";
import { planAllowsPaidFeatures, userPlanSlug } from "@/lib/plans/capabilities";

// Estúdio: prompt livre → app/site HTML completo via edge ai-generate
// (action generate_app). Geração detached com polling — sair da página
// não mata o job.
const bodySchema = z.object({
  nome: z.string().min(1).max(150),
  prompt: z.string().min(10).max(20_000),
  target: z.enum(["web", "mobile"]),
  refs: z.array(z.object({
    url: z.string().url().max(800),
    kind: z.enum(["image", "video"]),
  })).max(8).default([]),
});

const EDGE_TIMEOUT_MS = 300_000;
const STALE_MS = 8 * 60_000;

async function runJob(projectId: string, userId: string, token: string, payload: z.infer<typeof bodySchema>) {
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
        action: "generate_app",
        serviceSlug: "sites",
        businessRef: `studio:${projectId}`,
        requestRef: `studio-${projectId}`,
        lang: "pt",
        prompt: payload.prompt,
        context: { target: payload.target, refs: payload.refs },
        jobId: projectId,
        jobTable: "studio_projects",
      }),
      signal: AbortSignal.timeout(EDGE_TIMEOUT_MS),
    });
    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    const html = typeof data.conteudo === "string" && data.conteudo.includes("<") ? data.conteudo : null;
    if (!upstream.ok || !html) {
      const erro = typeof data.erro === "string" ? data.erro
        : typeof data.error === "string" ? data.error
        : "A geração não pôde ser concluída. Tente novamente.";
      await admin.from("studio_projects")
        .update({ status: "error", erro, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      await refundCreditAction(admin, userId, `studio-${projectId}`);
      return;
    }
    await admin.from("studio_projects")
      .update({ status: "done", html, modelo: typeof data.modelo === "string" ? data.modelo : null, progresso: 100, etapa: "Concluída", updated_at: new Date().toISOString() })
      .eq("id", projectId);
  } catch {
    await admin.from("studio_projects")
      .update({ status: "error", erro: "A geração demorou demais ou o serviço está indisponível.", updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .then(() => {}, () => {});
    await refundCreditAction(admin, userId, `studio-${projectId}`);
  }
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
  if (!session.profile?.consentimento_em || !session.profile?.onboarding_concluido) {
    return NextResponse.json({ error: "Conclua seu cadastro antes." }, { status: 403 });
  }
  // Apps web/mobile são exclusivos Pro/King (admin testa sempre).
  if (session.profile?.role !== "admin") {
    const planSlug = await userPlanSlug(session.supabase, session.user.id);
    if (!planAllowsPaidFeatures(planSlug)) {
      return NextResponse.json(
        { error: "A criação de sites e apps está nos planos Pro e King." },
        { status: 403 },
      );
    }
  }

  const raw = await request.text().catch(() => "");
  if (raw.length > 40_000) return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
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

  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin.from("studio_projects")
    .insert({
      user_id: session.user.id,
      nome: parsed.data.nome,
      prompt: parsed.data.prompt,
      target: parsed.data.target,
      refs: parsed.data.refs,
      status: "running",
    })
    .select("id").single();
  if (error || !project) {
    return NextResponse.json({ error: "Não foi possível iniciar a geração." }, { status: 400 });
  }

  void runJob(project.id, session.user.id, token, parsed.data);
  return NextResponse.json({ projectId: project.id }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    const { data: list } = await session.supabase.from("studio_projects")
      .select("id,status,erro,nome,target,site_slug,created_at")
      .order("created_at", { ascending: false }).limit(12);
    return NextResponse.json({ projects: list ?? [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data } = await session.supabase.from("studio_projects")
    .select("id,status,html,erro,nome,target,site_slug,modelo,created_at")
    .eq("id", id).maybeSingle();
  if (data?.status === "running" && Date.now() - new Date(data.created_at).getTime() > STALE_MS) {
    const admin = createSupabaseAdminClient();
    const erro = "A geração expirou. Tente novamente.";
    await admin.from("studio_projects")
      .update({ status: "error", erro, updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("status", "running");
    await refundCreditAction(admin, session.user.id, `studio-${data.id}`);
    return NextResponse.json({ project: { ...data, status: "error", erro } },
      { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ project: data ?? null }, { headers: { "Cache-Control": "no-store" } });
}
