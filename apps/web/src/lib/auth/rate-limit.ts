import "server-only";
import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "../supabase/admin";

export async function authRateLimit(action: string, account: string, headers: Headers) {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET;
  if (!secret) throw new Error("Rate limit indisponível.");
  const ip = process.env.TRUST_PROXY_HEADERS === "true"
    ? headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 64) || "unknown"
    : "shared";
  const rules = [
    { scope: `account:${account.toLowerCase()}`, limit: action === "login" ? 10 : action === "admin-plan" ? 30 : 5, window: 900 },
    { scope: `ip:${ip}`, limit: ip === "shared" ? 120 : 30, window: 900 },
  ];
  const admin = createSupabaseAdminClient();
  for (const rule of rules) {
    const key = createHmac("sha256", secret).update(`auth:${action}:${rule.scope}`).digest("hex");
    const { data, error } = await admin.rpc("check_auth_rate_limit", {
      p_key: key, p_limit: rule.limit, p_window_seconds: rule.window,
    });
    if (error || !data?.[0]) throw new Error("Rate limit indisponível.");
    if (!data[0].allowed) return { allowed: false, retryAfter: data[0].retry_after as number };
  }
  return { allowed: true, retryAfter: 0 };
}
