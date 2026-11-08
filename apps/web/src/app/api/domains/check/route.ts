import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { planAllowsPaidFeatures, userPlanSlug } from "@/lib/plans/capabilities";
import { checkDomainAvailable, HOST_RE } from "@/lib/domains/rdap";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  // Domínio personalizado é recurso dos planos Pro e King.
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

  const host = (request.nextUrl.searchParams.get("domain") ?? "")
    .trim().toLowerCase().replace(/^www\./, "");
  if (!HOST_RE.test(host)) {
    return NextResponse.json({ error: "Domínio inválido — use o formato exemplo.com.br" }, { status: 400 });
  }

  const result = await checkDomainAvailable(host);
  return NextResponse.json(result, { headers: NO_STORE });
}
