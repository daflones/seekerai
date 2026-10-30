import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { planAllowsPaidFeatures, userPlanSlug } from "@/lib/plans/capabilities";

// Publica o projeto do estúdio em /site/<slug> — sites.tipo="custom"
// renderiza o HTML salvo em config.html (iframe).
const bodySchema = z.object({ projectId: z.string().uuid() });

function slugify(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "app";
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    const planSlug = await userPlanSlug(session.supabase, session.user.id);
    if (!planAllowsPaidFeatures(planSlug)) {
      return NextResponse.json({ error: "A criação de sites e apps está nos planos Pro e King." }, { status: 403 });
    }
  }

  let value: unknown;
  try { value = await request.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(value);
  if (!parsed.success) return NextResponse.json({ error: "Revise os campos." }, { status: 400 });

  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de tentar novamente." }, { status: 429 });
  }

  // Só o dono publica; precisa ter terminado e ter HTML.
  const { data: project } = await session.supabase.from("studio_projects")
    .select("id,nome,prompt,target,html,status,site_slug")
    .eq("id", parsed.data.projectId).maybeSingle();
  if (!project || project.status !== "done" || !project.html) {
    return NextResponse.json({ error: "Projeto não encontrado ou ainda gerando." }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();

  // Republicar: atualiza o site já publicado em vez de criar outro.
  if (project.site_slug) {
    await admin.from("sites")
      .update({ config: buildConfig(project, session.user.id), updated_at: new Date().toISOString() })
      .eq("slug", project.site_slug);
    return NextResponse.json({ url: `/site/${project.site_slug}`, slug: project.site_slug });
  }

  const base = slugify(project.nome);
  let slug = base;
  for (let i = 2; i < 20; i++) {
    const { data: clash } = await admin.from("sites").select("slug").eq("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${i}`;
  }

  const { error } = await admin.from("sites").insert({
    slug,
    tipo: "custom",
    nome: project.nome.slice(0, 150),
    lead_id: null,
    config: buildConfig(project, session.user.id),
    publicado: true,
  });
  if (error) return NextResponse.json({ error: "Falha ao publicar." }, { status: 500 });

  await admin.from("studio_projects")
    .update({ site_slug: slug, updated_at: new Date().toISOString() })
    .eq("id", project.id);
  return NextResponse.json({ url: `/site/${slug}`, slug });
}

function buildConfig(project: { nome: string; target: string; html: string }, userId: string) {
  return {
    tipo: "custom",
    nome: project.nome,
    lang: "pt",
    owner: userId,          // gate de assinatura/trial por dono
    target: project.target, // "mobile" vira moldura de telefone no /site
    html: project.html,
    seo: { title: project.nome },
  };
}
