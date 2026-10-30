import { createRemoteJWKSet, jwtVerify } from "jose";
import { supabasePublicConfig } from "./config";

// Verifica o access token localmente via JWKS (cacheado ~10min pelo jose).
// Evita uma chamada à Auth API por request — e com ela a janela onde
// requests paralelas disparam refreshs concorrentes no mesmo refresh token.
// Retorna false quando não é possível confirmar a assinatura — o caller
// deve cair no fallback (getUser) em vez de negar acesso.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyAccessToken(token: string): Promise<boolean> {
  const config = supabasePublicConfig();
  if (!config) return false;
  try {
    jwks ??= createRemoteJWKSet(new URL(`${config.url}/auth/v1/.well-known/jwks.json`));
    await jwtVerify(token, jwks, { issuer: `${config.url}/auth/v1` });
    return true;
  } catch {
    return false;
  }
}
