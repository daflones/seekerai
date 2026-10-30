import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, supabasePublicConfig } from "./lib/auth/config";
import { readAccessToken, verifyAccessToken } from "./lib/auth/jwt";
import { callbackOrigin } from "./lib/auth/validation";

// Hosts que servem a própria plataforma — todo o resto é tratado como
// possível domínio customizado apontado para um site publicado.
const domainCache = new Map<string, { slug: string | null; at: number }>();
const DOMAIN_CACHE_TTL = 60_000;

function appHosts(): Set<string> {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) {
    try { hosts.add(new URL(url).hostname.toLowerCase()); } catch { /* ignora */ }
  }
  return hosts;
}

async function resolveCustomDomain(host: string, url: string, key: string): Promise<string | null> {
  const cached = domainCache.get(host);
  if (cached && Date.now() - cached.at < DOMAIN_CACHE_TTL) return cached.slug;
  let slug: string | null = null;
  try {
    const res = await fetch(
      `${url}/rest/v1/active_domains?host=eq.${encodeURIComponent(host)}&select=slug&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (res.ok) {
      const rows = (await res.json()) as { slug: string }[];
      slug = rows[0]?.slug ?? null;
    }
  } catch { /* resolve depois */ }
  domainCache.set(host, { slug, at: Date.now() });
  return slug;
}

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const config = supabasePublicConfig();
  const path = request.nextUrl.pathname;
  const privatePath = path === "/app" || path.startsWith("/app/") || path === "/admin" || path.startsWith("/admin/") ||
    path === "/completar-cadastro" || path === "/redefinir-senha";

  // Domínio customizado: qualquer rota serve o site publicado correspondente.
  if (host && !appHosts().has(host) && config) {
    const slug = await resolveCustomDomain(host, config.url, config.key);
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/site/${slug}`;
      return NextResponse.rewrite(url);
    }
  }

  // Páginas públicas no host do app passam direto (sem custo de sessão).
  if (!config || !privatePath) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
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
  // Fast path: access token lido do cookie + assinatura JWT local (sem
  // rede na Auth API). Só quando o token expirou/faltou é que chamamos o
  // cliente — o refresh acontece aqui, único lugar que grava cookies.
  const cookieToken = readAccessToken(request.cookies.getAll());
  let verified = cookieToken ? !!(await verifyAccessToken(cookieToken)) : false;
  if (!verified) {
    const { data: { session } } = await supabase.auth.getSession();
    const fresh = session?.access_token;
    if (fresh && fresh !== cookieToken && (await verifyAccessToken(fresh))) {
      verified = true;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      verified = !!user?.email_confirmed_at;
    }
  }
  if (!verified) {
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
  matcher: [
    "/app/:path*",
    "/admin/:path*",
    "/login",
    "/cadastro",
    "/recuperar-senha",
    "/redefinir-senha",
    "/completar-cadastro",
    // Hosts customizados: qualquer página pública pode ser um domínio de site.
    // Assets e APIs ficam de fora para não pagar lookup em todo request.
    "/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|manifest.json|icons|.*\\.[a-zA-Z0-9]{2,5}$).*)",
  ],
};
