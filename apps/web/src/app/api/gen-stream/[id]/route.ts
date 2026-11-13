import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { genServiceUrl } from "@/lib/gen-service";

// Proxy SSE do Gen Service: o browser conecta aqui (com cookie de sessão)
// e a rota repassa pro serviço com o JWT do usuário — o EventSource não
// consegue mandar Authorization, então a auth fica toda neste proxy.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const base = genServiceUrl();
  if (!base) return NextResponse.json({ error: "Serviço indisponível." }, { status: 503 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Inválido." }, { status: 400 });

  // Confirma que o job é do usuário antes de abrir o stream.
  const [{ data: a }, { data: s }, { data: j }] = await Promise.all([
    session.supabase.from("ai_jobs").select("id").eq("id", id).eq("user_id", session.user.id).maybeSingle(),
    session.supabase.from("studio_projects").select("id").eq("id", id).eq("user_id", session.user.id).maybeSingle(),
    session.supabase.from("search_jobs").select("id").eq("id", id).eq("user_id", session.user.id).maybeSingle(),
  ]);
  if (!a && !s && !j) return NextResponse.json({ error: "Geração não encontrada." }, { status: 404 });

  const token = session.accessToken;
  if (!token) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const upstream = await fetch(`${base}/stream/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: request.signal,
    cache: "no-store",
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json({ error: "Stream indisponível." }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
