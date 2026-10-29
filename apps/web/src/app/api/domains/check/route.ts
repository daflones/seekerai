import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { planAllowsPaidFeatures, userPlanSlug } from "@/lib/plans/capabilities";

const HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const UA = { "User-Agent": "SeekerAi/1.0 (+https://seekerai.digital)", Accept: "application/rdap+json, application/json" };

// rdap.org bloqueia requests sem User-Agent (403). .br tem RDAP
// próprio autoritativo; .com/.net consultam o registry direto.
function rdapUrls(host: string): string[] {
  const urls: string[] = [];
  if (host.endsWith(".br")) urls.push(`https://rdap.registro.br/domain/${encodeURIComponent(host)}`);
  else if (host.endsWith(".com")) urls.push(`https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(host)}`);
  else if (host.endsWith(".net")) urls.push(`https://rdap.verisign.com/net/v1/domain/${encodeURIComponent(host)}`);
  else if (host.endsWith(".org")) urls.push(`https://rdap.publicinterestregistry.org/rdap/domain/${encodeURIComponent(host)}`);
  urls.push(`https://rdap.org/domain/${encodeURIComponent(host)}`);
  return urls;
}

// Disponibilidade via RDAP (rdap.org delega ao registro do TLD — .br
// resolve no registro.br). 404 = livre; 200 = registrado; resto = incerto.
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

  for (const url of rdapUrls(host)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: UA });
      if (res.status === 404) {
        return NextResponse.json({ host, available: true }, { headers: { "Cache-Control": "no-store" } });
      }
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          events?: { eventAction?: string; eventDate?: string }[];
        };
        const expiry = data.events?.find((e) => e.eventAction === "expiration")?.eventDate ?? null;
        return NextResponse.json({ host, available: false, expiresAt: expiry },
          { headers: { "Cache-Control": "no-store" } });
      }
      // Outros status (403/429/5xx): tenta o próximo registry.
    } catch { /* timeout/rede — tenta o próximo */ }
  }
  return NextResponse.json({ host, available: null }, { headers: { "Cache-Control": "no-store" } });
}
