import { NextResponse, type NextRequest } from "next/server";
import { signPhotoRef } from "@/lib/demo-photo";

// Foto pública da demo: mesma resolução de /api/place-photo, mas sem
// sessão — a referência só resolve se vier com a assinatura emitida
// pela rota /api/demo/search (hmac do ref). Assim não vira proxy aberto.
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref") ?? "";
  const sig = request.nextUrl.searchParams.get("sig") ?? "";
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref) || sig !== signPhotoRef(ref)) {
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
