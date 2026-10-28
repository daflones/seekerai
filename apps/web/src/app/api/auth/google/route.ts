import { NextResponse, type NextRequest } from "next/server";
import { authReady } from "@/lib/auth/config";
import { callbackOrigin, safeNext } from "@/lib/auth/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Início do OAuth Google: gera a URL do provedor com o code verifier
// PKCE salvo em cookie (o /auth/callback troca o code por sessão depois).
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || request.nextUrl.host;
  const origin = callbackOrigin(`${request.nextUrl.protocol}//${host}`);
  if (!authReady()) {
    return NextResponse.redirect(new URL("/login?estado=oauth-indisponivel", origin), 303);
  }
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const redirectTo = new URL("/auth/callback", origin);
  redirectTo.searchParams.set("next", next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo.toString() },
  });
  if (error || !data.url) {
    return NextResponse.redirect(new URL("/login?estado=oauth-falhou", origin), 303);
  }
  return NextResponse.redirect(data.url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
