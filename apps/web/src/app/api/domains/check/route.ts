import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { authRateLimit } from "@/lib/auth/rate-limit";

const HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// Disponibilidade via RDAP (rdap.org delega ao registro do TLD — .br
// resolve no registro.br). 404 = livre; 200 = registrado; resto = incerto.
export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });

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

  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(host)}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/rdap+json, application/json" },
    });
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
    return NextResponse.json({ host, available: null },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ host, available: null },
      { headers: { "Cache-Control": "no-store" } });
  }
}
