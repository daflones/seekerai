import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { planAllowsPaidFeatures, userPlanSlug } from "@/lib/plans/capabilities";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkDomainAvailable, domainCandidates } from "@/lib/domains/rdap";

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    const planSlug = await userPlanSlug(session.supabase, session.user.id);
    if (!planAllowsPaidFeatures(planSlug)) {
      return NextResponse.json({ error: "Domínio personalizado está nos planos Pro e King." }, { status: 403 });
    }
  }

  const limit = await authRateLimit("admin-integration", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de consultar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const slug = (request.nextUrl.searchParams.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,78}$/.test(slug)) {
    return NextResponse.json({ error: "Site inválido." }, { status: 400 });
  }

  // Mesmo critério de posse da página de domínios: site de lead do usuário
  // ou site de estúdio cujo config->>owner é o usuário.
  const admin = createSupabaseAdminClient();
  const [{ data: leadSite }, { data: studioSite }] = await Promise.all([
    admin.from("sites").select("nome,leads!inner(user_id)")
      .eq("slug", slug).eq("leads.user_id", session.user.id).maybeSingle(),
    admin.from("sites").select("nome")
      .eq("slug", slug).eq("config->>owner", session.user.id).maybeSingle(),
  ]);
  const nome = leadSite?.nome ?? studioSite?.nome;
  if (!nome) return NextResponse.json({ error: "Site não encontrado." }, { status: 404 });

  const candidates = domainCandidates(nome);
  const results = await Promise.all(candidates.map((host) => checkDomainAvailable(host)));

  return NextResponse.json(
    { suggestions: results.sort((a, b) => Number(b.available === true) - Number(a.available === true)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
