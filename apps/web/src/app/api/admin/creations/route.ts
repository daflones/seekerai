import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Aba admin de criações: tudo que os usuários geraram — sites de lead,
// apps do Estúdio (web/mobile), imagens e textos — com dono, modelo de
// IA, status e links pra ver/editar. ?detail=app:<id> devolve o payload
// pesado (html/config/conteúdo) sob demanda pro inspetor de código.

export interface AdminCreation {
  id: string;
  kind: "site" | "app" | "image" | "text";
  sub: string;
  title: string;
  owner: string;
  ownerId: string;
  leadName: string | null;
  siteSlug: string | null;
  status: "done" | "running" | "error";
  erro: string | null;
  model: string | null;
  createdAt: string;
}

const TEXT_KINDS = new Set(["sales_reply", "deep_strategy", "image_prompt"]);

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session || session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }
  const admin = createSupabaseAdminClient();
  const detail = request.nextUrl.searchParams.get("detail");

  if (detail) {
    const [kind, id] = detail.split(":", 2);
    if (kind === "app" && id) {
      const { data } = await admin.from("studio_projects")
        .select("prompt,html,refs,modelo,erro").eq("id", id).maybeSingle();
      return NextResponse.json({ detail: data }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "site" && id) {
      const { data } = await admin.from("lead_outputs")
        .select("conteudo,modelo").eq("id", id).maybeSingle();
      // O HTML do site vive na linha sites (config) — conteudo guarda o prompt/resumo.
      return NextResponse.json({ detail: data }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "site-config" && id) {
      const { data } = await admin.from("sites")
        .select("config,tipo,nome,publicado").eq("slug", id).maybeSingle();
      return NextResponse.json({ detail: data }, { headers: { "Cache-Control": "no-store" } });
    }
    if ((kind === "text" || kind === "image") && id) {
      const { data } = await admin.from("lead_outputs")
        .select("conteudo,modelo,tipo").eq("id", id).maybeSingle();
      return NextResponse.json({ detail: data }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Detalhe inválido." }, { status: 400 });
  }

  const [projectsRes, outputsRes, leadsRes, profilesRes] = await Promise.all([
    admin.from("studio_projects")
      .select("id,user_id,nome,prompt,target,status,erro,modelo,site_slug,lead_id,created_at")
      .order("created_at", { ascending: false }).limit(400),
    admin.from("lead_outputs")
      .select("id,user_id,lead_id,tipo,modelo,created_at")
      .order("created_at", { ascending: false }).limit(1000),
    admin.from("leads").select("id,nome,dados").limit(3000),
    admin.from("profiles").select("id,nome").limit(5000),
  ]);

  const leadById = new Map((leadsRes.data ?? []).map((l) => [l.id, l as { id: string; nome: string | null; dados: unknown }]));
  const ownerById = new Map((profilesRes.data ?? []).map((p) => [p.id, (p as { nome?: string }).nome ?? "?"]));

  const items: AdminCreation[] = [];
  for (const p of projectsRes.data ?? []) {
    items.push({
      id: p.id, kind: "app", sub: p.target === "mobile" ? "app_mobile" : "app_web",
      title: p.nome ?? "", owner: ownerById.get(p.user_id) ?? "?", ownerId: p.user_id,
      leadName: p.lead_id ? leadById.get(p.lead_id)?.nome ?? null : null, siteSlug: p.site_slug,
      status: p.status === "running" ? "running" : p.status === "error" ? "error" : "done",
      erro: p.erro, model: p.modelo ?? null, createdAt: p.created_at,
    });
  }
  for (const o of outputsRes.data ?? []) {
    const lead = leadById.get(o.lead_id);
    const slug = (lead?.dados as { siteSlug?: string } | null)?.siteSlug ?? null;
    const kind = o.tipo === "generate_site" ? "site" : o.tipo === "generate_image" ? "image"
      : TEXT_KINDS.has(o.tipo) ? "text" : null;
    if (!kind) continue;
    items.push({
      id: o.id, kind, sub: o.tipo, title: lead?.nome ?? "", owner: ownerById.get(o.user_id) ?? "?",
      ownerId: o.user_id, leadName: lead?.nome ?? null, siteSlug: slug,
      status: "done", erro: null, model: o.modelo, createdAt: o.created_at,
    });
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ items: items.slice(0, 800) }, { headers: { "Cache-Control": "no-store" } });
}
