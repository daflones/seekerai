import { NextResponse } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Monitor de jobs do painel admin: unifica search_jobs, ai_jobs e
// studio_projects com dono, etapa e resumo do resultado.
export async function GET() {
  const session = await verifiedSession();
  if (!session || session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Somente admin." }, { status: 403 });
  }
  const admin = createSupabaseAdminClient();
  const [{ data: sjobs }, { data: ajobs }, { data: studio }] = await Promise.all([
    admin.from("search_jobs")
      .select("id,user_id,status,payload,result,erro,progresso,etapa,created_at,updated_at")
      .order("created_at", { ascending: false }).limit(40),
    admin.from("ai_jobs")
      .select("id,user_id,lead_id,tipo,status,result,erro,progresso,etapa,created_at,updated_at")
      .order("created_at", { ascending: false }).limit(40),
    admin.from("studio_projects")
      .select("id,user_id,nome,prompt,target,status,erro,site_slug,progresso,etapa,created_at,updated_at")
      .order("created_at", { ascending: false }).limit(40),
  ]);

  const userIds = [...new Set([
    ...(sjobs ?? []), ...(ajobs ?? []), ...(studio ?? []),
  ].map((j) => j.user_id))];
  const leadIds = [...new Set((ajobs ?? []).map((j) => j.lead_id).filter(Boolean))];
  const [{ data: profiles }, { data: leads }] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id,nome").in("id", userIds)
      : { data: [] },
    leadIds.length
      ? admin.from("leads").select("id,nome").in("id", leadIds)
      : { data: [] },
  ]);
  const nomeById = new Map((profiles ?? []).map((p) => [p.id, p.nome ?? "Usuário"]));
  const leadById = new Map((leads ?? []).map((l) => [l.id, l.nome]));

  const jobs = [
    ...(sjobs ?? []).map((j) => {
      const payload = (j.payload ?? {}) as Record<string, unknown>;
      const result = (j.result ?? null) as Record<string, unknown> | null;
      const resultados = Array.isArray(result?.resultados)
        ? result.resultados as Record<string, unknown>[]
        : [];
      return {
        id: j.id, fonte: "busca", tipo: "Busca no radar",
        titulo: String(payload.query ?? "busca"),
        detalhe: `${payload.regionCode ?? "BR"} · provedor ${result?.provedor ?? "…"}`,
        usuario: nomeById.get(j.user_id) ?? "Usuário",
        status: j.status, progresso: j.progresso ?? 0, etapa: j.etapa,
        erro: j.erro, created_at: j.created_at, updated_at: j.updated_at,
        resumo: resultados.length
          ? `${resultados.length} estabelecimentos encontrados`
          : null,
        itens: resultados.slice(0, 6).map((r) => String(r.nome ?? "")).filter(Boolean),
        link: null,
      };
    }),
    ...(ajobs ?? []).map((j) => {
      const result = (j.result ?? null) as Record<string, unknown> | null;
      const slug = typeof result?.siteSlug === "string" ? result.siteSlug : null;
      return {
        id: j.id, fonte: "ia", tipo: "Site do lead",
        titulo: leadById.get(j.lead_id) ?? "Lead",
        detalhe: j.tipo,
        usuario: nomeById.get(j.user_id) ?? "Usuário",
        status: j.status, progresso: j.progresso ?? 0, etapa: j.etapa,
        erro: j.erro, created_at: j.created_at, updated_at: j.updated_at,
        resumo: slug ? `Publicado em /site/${slug}` : null,
        itens: [],
        link: slug ? `/site/${slug}` : null,
      };
    }),
    ...(studio ?? []).map((j) => ({
      id: j.id, fonte: "estudio",
      tipo: j.target === "mobile" ? "App mobile" : "App web",
      titulo: j.nome,
      detalhe: (j.prompt ?? "").slice(0, 90),
      usuario: nomeById.get(j.user_id) ?? "Usuário",
      status: j.status, progresso: j.progresso ?? 0, etapa: j.etapa,
      erro: j.erro, created_at: j.created_at, updated_at: j.updated_at,
      resumo: j.site_slug ? `Publicado em /site/${j.site_slug}` : null,
      itens: [],
      link: j.site_slug ? `/site/${j.site_slug}` : null,
    })),
  ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 60);

  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}
