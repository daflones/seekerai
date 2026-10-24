// Utilitários compartilhados das Edge Functions do SeekerAi.
// Deno runtime (Supabase Edge Functions).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = Deno.env.get(name);
  return value && value.length > 0 ? value : undefined;
}

/** Cliente com service role — só no servidor das functions. */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Autentica o chamador pelo JWT Bearer e devolve o user id. */
export async function requireUser(req: Request): Promise<{ id: string }> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) throw httpError(401, "Sessão ausente");
  const client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw httpError(401, "Sessão inválida");
  return { id: data.user.id };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function httpError(status: number, message: string): HttpError {
  return new HttpError(status, message);
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function fail(err: unknown): Response {
  if (err instanceof HttpError) return json({ erro: err.message }, err.status);
  console.error("[edge] erro interno:", err instanceof Error ? err.message : String(err));
  return json({ erro: "Falha interna" }, 500);
}

export function requirePost(req: Request): void {
  if (req.method !== "POST") throw httpError(405, "Método não permitido");
}

export async function readJson<T>(req: Request, maxBytes = 64_000): Promise<T> {
  const length = Number(req.headers.get("Content-Length") ?? 0);
  if (length > maxBytes) throw httpError(413, "Payload muito grande");
  let body: T;
  try {
    body = (await req.json()) as T;
  } catch {
    throw httpError(400, "JSON inválido");
  }
  return body;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, maxLen = 300): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLen
    ? value
    : null;
}

// ---------- cripto ----------

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(
  key: string | Uint8Array,
  message: string | Uint8Array,
): Promise<string> {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const msgBytes = typeof message === "string" ? new TextEncoder().encode(message) : message;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    msgBytes as unknown as BufferSource,
  );
  return toHex(new Uint8Array(signature));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Comparação em tempo constante para assinaturas hex. */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

// ---------- reserva de créditos ----------

export async function reserveAction(
  client: SupabaseClient,
  params: {
    userId: string;
    action: string;
    businessRef: string | null;
    service: string;
    inputHash: string;
    requestRef: string;
  },
): Promise<{ cost: number; status: string }> {
  const { data, error } = await client.rpc("reserve_credit_action", {
    p_user: params.userId,
    p_action: params.action,
    p_business_ref: params.businessRef,
    p_service: params.service,
    p_input_hash: params.inputHash,
    p_request_ref: params.requestRef,
  });
  if (error) {
    const message = error.message ?? "Falha ao reservar créditos";
    if (/saldo|insufficient|Wallet/i.test(message)) {
      throw httpError(402, "Créditos insuficientes");
    }
    if (/pricing|configured|disabled|incompatible|scope/i.test(message)) {
      throw httpError(409, "Ação indisponível para este serviço");
    }
    throw httpError(400, "Não foi possível reservar créditos");
  }
  return { cost: data.cost, status: data.status };
}

export async function settleAction(
  client: SupabaseClient,
  userId: string,
  requestRef: string,
  outcome: "completed" | "refunded",
): Promise<void> {
  const { error } = await client.rpc("settle_credit_action", {
    p_user: userId,
    p_request_ref: requestRef,
    p_outcome: outcome,
  });
  if (error) {
    // Falha de liquidação não deve derrubar a resposta ao usuário;
    // créditos presos em 'reserved' são reconciliados depois.
    console.error(`[edge] settle ${outcome} falhou:`, error.message);
  }
}
