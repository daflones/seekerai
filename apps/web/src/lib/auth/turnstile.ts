import "server-only";
import { callbackOrigin } from "./validation";

// Login/signup/recovery tokens are verified ONCE by Supabase native CAPTCHA.
// This verifier is only for authenticated actions that GoTrue does not protect.
export async function verifyAuthenticatedCaptcha(token: string, action: string, origin: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    if (!result || typeof result !== "object") return false;
    const data = result as { success?: boolean; hostname?: string; action?: string };
    return data.success === true && data.action === action &&
      data.hostname === new URL(callbackOrigin(origin)).hostname;
  } catch { return false; }
}
