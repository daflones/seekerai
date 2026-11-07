// GET /api/health — liveness rápida (usada pelo HEALTHCHECK do Docker).
// GET /api/health?deep=1 — também mede se o container alcança a Auth API
// do Supabase; é o teste que diferencia "site quebrou" de "rede do
// servidor não chega no provedor" (o caso dos 504/522 em produção).
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep");
  const body: Record<string, unknown> = { status: "ok", service: "seekerai-web" };
  if (deep) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      body.supabase = { reachable: false, error: "NEXT_PUBLIC_SUPABASE_URL ausente" };
    } else {
      const started = Date.now();
      try {
        const res = await fetch(`${url}/auth/v1/health`, {
          signal: AbortSignal.timeout(6_000),
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" },
        });
        body.supabase = { reachable: true, httpStatus: res.status, ms: Date.now() - started };
      } catch (err) {
        body.supabase = { reachable: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started };
      }
    }
  }
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
