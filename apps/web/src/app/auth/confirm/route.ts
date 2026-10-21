import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { callbackOrigin, safeNext } from "@/lib/auth/validation";
import { authReady } from "@/lib/auth/config";

export async function GET(request: NextRequest) {
  const origin = callbackOrigin(`${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`);
  const hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (authReady() && hash && hash.length <= 4096 && (type === "email" || type === "signup" || type === "recovery")) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: hash, type });
    if (!error) {
      const next = type === "recovery" ? "/redefinir-senha" : safeNext(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(next, origin), { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
  }
  return NextResponse.redirect(new URL("/login?estado=link-expirado", origin), 303);
}
