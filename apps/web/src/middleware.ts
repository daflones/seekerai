import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, supabasePublicConfig } from "./lib/auth/config";
import { callbackOrigin } from "./lib/auth/validation";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = supabasePublicConfig();
  if (!config) return response;
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, { ...options, ...authCookieOptions });
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const privatePath = path === "/app" || path.startsWith("/app/") || path === "/admin" || path.startsWith("/admin/") ||
    path === "/completar-cadastro" || path === "/redefinir-senha";
  if (privatePath && (!user || !user.email_confirmed_at)) {
    const incomingOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
    const url = new URL("/login", callbackOrigin(incomingOrigin));
    if (path.startsWith("/app") || path.startsWith("/admin")) url.searchParams.set("next", path);
    const redirected = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirected.cookies.set(cookie);
    return redirected;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/login", "/cadastro", "/recuperar-senha", "/redefinir-senha", "/completar-cadastro"],
};
