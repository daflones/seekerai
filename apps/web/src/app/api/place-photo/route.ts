import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";

// Proxy de foto do Google Places: recebe a referência "places/.../photos/...",
// resolve a URL assinada no servidor (a chave nunca sai pro navegador)
// e redireciona com cache de 24h. Sessão exigida pra não virar proxy aberto.
export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });

  const ref = request.nextUrl.searchParams.get("ref") ?? "";
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref)) {
    return NextResponse.json({ error: "Referência inválida." }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Fotos indisponíveis." }, { status: 500 });

  const res = await fetch(
    `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=640&skipHttpRedirect=true&key=${apiKey}`,
    { signal: AbortSignal.timeout(15_000) },
  ).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "Foto indisponível." }, { status: 500 });
  const data = (await res.json().catch(() => null)) as { photoUri?: string } | null;
  if (!data?.photoUri) return NextResponse.json({ error: "Foto indisponível." }, { status: 500 });
  return NextResponse.redirect(data.photoUri, {
    status: 302,
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
