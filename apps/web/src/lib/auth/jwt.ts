import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { supabasePublicConfig } from "./config";

// Verifica o access token localmente via JWKS (cacheado ~10min pelo jose).
// Evita uma chamada à Auth API por request — e com ela a janela onde
// requests paralelas disparam refreshs concorrentes no mesmo refresh token.
// Retorna null quando não é possível confirmar a assinatura — o caller
// deve cair no fallback (getUser) em vez de negar acesso.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  const config = supabasePublicConfig();
  if (!config) return null;
  try {
    jwks ??= createRemoteJWKSet(new URL(`${config.url}/auth/v1/.well-known/jwks.json`));
    const { payload } = await jwtVerify(token, jwks, { issuer: `${config.url}/auth/v1` });
    return payload;
  } catch {
    return null;
  }
}

// Lê o access token direto dos cookies da sessão Supabase sem chamar
// getSession() — evita o warning "user object could be insecure" por
// request e, principalmente, evita refreshs de token acidentais fora do
// middleware. Os cookies podem vir quebrados em chunks (.0, .1, ...).
const CHUNK_RE = /^sb-[a-z0-9]+-auth-token(?:\.(\d+))?$/;

export function readAccessToken(cookies: { name: string; value: string }[]): string | null {
  const chunks = cookies
    .filter((c) => CHUNK_RE.test(c.name))
    .sort((a, b) => {
      const ai = Number(CHUNK_RE.exec(a.name)?.[1] ?? 0);
      const bi = Number(CHUNK_RE.exec(b.name)?.[1] ?? 0);
      return ai - bi;
    });
  if (!chunks.length) return null;
  let raw = chunks.map((c) => c.value).join("");
  try { raw = decodeURIComponent(raw); } catch { /* já decodificado */ }
  if (raw.startsWith("base64-")) {
    try { raw = Buffer.from(raw.slice(7), "base64url").toString("utf8"); } catch { return null; }
  }
  try {
    const session = JSON.parse(raw) as { access_token?: unknown };
    return typeof session.access_token === "string" && session.access_token ? session.access_token : null;
  } catch {
    return null;
  }
}
