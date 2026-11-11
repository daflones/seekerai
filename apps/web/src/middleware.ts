import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, supabasePublicConfig } from "./lib/auth/config";
import { readAccessToken, readRefreshToken, verifyAccessToken } from "./lib/auth/jwt";
import { callbackOrigin } from "./lib/auth/validation";

// Hosts que servem a própria plataforma — todo o resto é tratado como
// possível domínio customizado apontado para um site publicado.
const domainCache = new Map<string, { slug: string | null; at: number }>();
const DOMAIN_CACHE_TTL = 60_000;

// Requests paralelas com o access token expirado disparavam refreshes
// concorrentes do MESMO refresh token — o primeiro que rotaciona invalida
// os demais (409 conflict / already_used) e envenena a sessão. Dedup por
// refresh token faz as concorrentes compartilharem um único refresh.
type AuthClient = ReturnType<typeof createServerClient>;
const refreshInflight = new Map<string, ReturnType<AuthClient["auth"]["getSession"]>>();

async function dedupedGetSession(supabase: AuthClient, key: string | null) {
  if (!key) return supabase.auth.getSession();
  const pending = refreshInflight.get(key);
  if (pending) return pending;
  const task = supabase.auth.getSession();
  refreshInflight.set(key, task);
  task.finally(() => {
    if (refreshInflight.get(key) === task) refreshInflight.delete(key);
  });
  return task;
}

// Erros que indicam cookie envenenado — a sessão já não existe mais na
// Auth API, então reenviar os mesmos cookies só repete a falha.
function isStaleSessionError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  return code === "refresh_token_already_used" || code === "refresh_token_not_found" ||
    code === "conflict" || /refresh token.*(invalid|used|not found|expired)/i.test(message);
}

// Timeout curto nas chamadas à Auth API — sem ele, uma instabilidade do
// provedor transforma cada request em espera indefinida (site "travado").
const AUTH_CALL_TIMEOUT = 8_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth-timeout")), AUTH_CALL_TIMEOUT);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// Marca todos os cookies sb-* como expirados na resposta — única forma de
// o browser se recuperar de refresh token já usado sem limpeza manual.
function expireAuthCookies(target: NextResponse, request: NextRequest) {
  for (const { name } of request.cookies.getAll()) {
    if (/^sb-/.test(name)) target.cookies.set(name, "", { ...authCookieOptions, maxAge: 0 });
  }
}

const AUTH_COOKIE_CHUNK = 3180; // mesmo MAX_CHUNK_SIZE do @supabase/ssr

// Quando o refresh veio do dedupe (outra request executou a chamada), os
// cookies novos precisam ser gravados NESTA resposta — senão o browser
// segue mandando o token expirado e o ciclo recomeça. Replica o formato
// do @supabase/ssr: "base64-<base64url(JSON)>" fatiado em .0/.1/...
function sessionCookieParts(baseName: string, session: unknown) {
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  // base64url não tem caracteres escapáveis — as fatias saem limpas.
  if (encoded.length <= AUTH_COOKIE_CHUNK) return [{ name: baseName, value: encoded }];
  const parts = [];
  for (let i = 0; i * AUTH_COOKIE_CHUNK < encoded.length; i++) {
    parts.push({ name: `${baseName}.${i}`, value: encoded.slice(i * AUTH_COOKIE_CHUNK, (i + 1) * AUTH_COOKIE_CHUNK) });
  }
  return parts;
}

function appHosts(): Set<string> {
  // Domínios da própria plataforma — inclui os espelhos de país
  // (.com.br) senão caíam no lookup de domínio customizado por request.
  const hosts = new Set<string>(["localhost", "127.0.0.1", "seekerai.com.br", "www.seekerai.com.br"]);
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) {
    try { hosts.add(new URL(url).hostname.toLowerCase()); } catch { /* ignora */ }
  }
  for (const o of (process.env.APP_EXTRA_ORIGINS ?? "").split(",")) {
    try { if (o.trim()) hosts.add(new URL(o.trim()).hostname.toLowerCase()); } catch { /* ignora */ }
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

  // Acesso do Brasil ao .digital → .com.br. O header cf-ipcountry só é
  // confiável atrás do Cloudflare (quem bate direto não tem o header e
  // segue no .digital). Exceções: /auth/* precisa completar no domínio
  // que iniciou o fluxo (cookie PKCE vive lá) e POST/ação não vira 302.
  if (host === "seekerai.digital" && request.headers.get("cf-ipcountry") === "BR" &&
      (request.method === "GET" || request.method === "HEAD") && !path.startsWith("/auth/")) {
    return NextResponse.redirect(`https://seekerai.com.br${path}${request.nextUrl.search}`, 302);
  }

  // Domínio customizado: qualquer rota serve o site publicado correspondente.
  if (host && !appHosts().has(host) && config) {
    const apex = host.startsWith("www.") ? host.slice(4) : host;
    const slug = await resolveCustomDomain(apex, config.url, config.key);
    if (slug) {
      if (apex !== host) {
        // www.dominio.com → dominio.com (domínio ativo é sempre o apex)
        const target = new URL(`https://${apex}${request.nextUrl.pathname}${request.nextUrl.search}`);
        return NextResponse.redirect(target, 301);
      }
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
  let verified = false;
  let bearer = cookieToken;
  if (cookieToken) {
    try {
      // JWKS vem da Auth API — sem timeout, uma instabilidade do provedor
      // travava o fast path do mesmo jeito que o refresh travava.
      verified = !!(await withTimeout(verifyAccessToken(cookieToken)));
    } catch { /* JWKS indisponível — cai no fluxo de refresh/login */ }
  }
  let staleSession = false;
  if (!verified) {
    try {
      const refreshKey = readRefreshToken(request.cookies.getAll()) ?? cookieToken;
      const { data: { session }, error: sessionError } = await withTimeout(dedupedGetSession(supabase, refreshKey));
      const fresh = session?.access_token;
      if (fresh && fresh !== cookieToken && (await verifyAccessToken(fresh))) {
        const projectRef = new URL(config.url).hostname.split(".")[0];
        const baseName = `sb-${projectRef}-auth-token`;
        const parts = sessionCookieParts(baseName, session);
        const wanted = new Set(parts.map((p) => p.name));
        const stale = request.cookies.getAll().map((c) => c.name)
          .filter((n) => (n === baseName || n.startsWith(`${baseName}.`)) && !wanted.has(n));
        for (const p of parts) request.cookies.set(p.name, p.value);
        for (const n of stale) request.cookies.delete(n);
        response = NextResponse.next({ request });
        for (const p of parts) response.cookies.set(p.name, p.value, { ...authCookieOptions });
        for (const n of stale) response.cookies.set(n, "", { ...authCookieOptions, maxAge: 0 });
        verified = true;
        bearer = fresh;
      } else {
        if (sessionError && isStaleSessionError(sessionError)) staleSession = true;
        const { data: { user }, error: userError } = await withTimeout(supabase.auth.getUser());
        if (userError && isStaleSessionError(userError)) staleSession = true;
        verified = !!user?.email_confirmed_at;
      }
    } catch (err) {
      // Erro de rede/timeout da Auth API ou refresh token inválido — não
      // deixa a exceção propagar (request travava). O usuário cai no
      // redirect abaixo em vez de ficar preso numa página em branco.
      staleSession = isStaleSessionError(err);
    }
  }
  if (!verified) {
    const incomingOrigin = `${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`;
    const url = new URL("/login", callbackOrigin(incomingOrigin));
    if (path.startsWith("/app") || path.startsWith("/admin")) url.searchParams.set("next", path);
    const redirected = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirected.cookies.set(cookie);
    if (staleSession) expireAuthCookies(redirected, request);
    return redirected;
  }

  // Cota diária: a escrita (claim_daily_credits faz FOR UPDATE na wallet)
  // acontece no máximo 1x/dia por usuário — as páginas leem o estado pela
  // função read-only daily_credit_state(). O cookie-marca evita a
  // chamada em cada navegação.
  const DAILY_COOKIE = "sk-daily";
  const todaySP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (bearer && request.cookies.get(DAILY_COOKIE)?.value !== todaySP) {
    try {
      const res = await fetch(`${config.url}/rest/v1/rpc/claim_daily_credits`, {
        method: "POST",
        headers: { apikey: config.key, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(4_000),
        body: "{}",
      });
      if (res.ok) {
        response.cookies.set(DAILY_COOKIE, todaySP, { ...authCookieOptions, maxAge: 60 * 60 * 48 });
      }
    } catch { /* tenta de novo no próximo request */ }
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
