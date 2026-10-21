import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { callbackOrigin, safeNext } from "@/lib/auth/validation";
import { authReady } from "@/lib/auth/config";

export async function GET(request: NextRequest) {
  const origin = callbackOrigin(`${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`);
  const code = request.nextUrl.searchParams.get("code");
  if (authReady() && code && code.length <= 4096) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const next = request.nextUrl.searchParams.get("recovery") === "1"
        ? "/redefinir-senha" : safeNext(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(next, origin), { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
  }
  return NextResponse.redirect(new URL("/login?estado=link-expirado", origin), 303);
}
