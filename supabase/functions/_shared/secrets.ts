// Resolução de secrets nas edge functions:
//   1) Deno.env (supabase secrets — bootstrap)
//   2) integration_secrets no banco (provedor 'edge', editável no painel admin)
// Cache de 60s por instância. Descriptografia AES-256-GCM idêntica a
// apps/web/src/lib/security/encryption.ts (envelope v1.iv.tag.ct, AAD=contexto).

import { serviceClient } from "./common.ts";

const cache = new Map<string, { v: string | null; t: number }>();
const CACHE_MS = 60_000;

async function decryptEnvelope(envelope: string, context: string): Promise<string> {
  const raw = Deno.env.get("APP_ENCRYPTION_KEY");
  if (!raw) throw new Error("APP_ENCRYPTION_KEY ausente nas edge secrets");
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Envelope inválido");
  const iv = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  const tag = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0));
  const ciphertext = new Uint8Array(ct.length + tag.length);
  ciphertext.set(ct);
  ciphertext.set(tag, ct.length);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plain);
}

export async function getSecret(name: string): Promise<string | null> {
  const envValue = Deno.env.get(name);
  if (envValue) return envValue;
  const hit = cache.get(name);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  let value: string | null = null;
  try {
    const { data } = await serviceClient()
      .from("integration_secrets")
      .select("valor_criptografado")
      .eq("provedor", "edge")
      .eq("nome", name)
      .maybeSingle();
    if (data?.valor_criptografado) {
      value = await decryptEnvelope(data.valor_criptografado, `edge:${name}`);
    }
  } catch (err) {
    console.error(`[secrets] falha ao ler ${name}:`, err instanceof Error ? err.message : err);
  }
  cache.set(name, { v: value, t: Date.now() });
  return value;
}

export async function requireSecret(name: string): Promise<string> {
  const value = await getSecret(name);
  if (!value) {
    throw new Error(`${name} não configurado (admin → Integrações)`);
  }
  return value;
}

const settingsCache = new Map<string, { v: unknown; t: number }>();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = settingsCache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v as T;
  let value: unknown = fallback;
  try {
    const { data } = await serviceClient()
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (data?.value !== undefined && data.value !== null) value = data.value;
  } catch {
    // mantém fallback
  }
  settingsCache.set(key, { v: value, t: Date.now() });
  return value as T;
}
