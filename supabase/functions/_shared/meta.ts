// Meta Conversions API (CAPI) — eventos server-side pro Pixel.
// Ativa quando META_PIXEL_ID + META_CAPI_TOKEN existirem (supabase
// secrets ou integration_secrets no painel admin). Opcional:
// META_TEST_EVENT_CODE pra testar no Gerenciador de Eventos.
// Falha silenciosa: tracking nunca derruba a request que chamou.
import { isRecord, serviceClient } from "./common.ts";
import { getSecret } from "./secrets.ts";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface CapiEvent {
  eventName: string;
  eventId: string;
  email?: string | null;
  valueReais?: number | null;
  currency?: string;
  fbp?: string | null;
  fbc?: string | null;
  url?: string | null;
}

export async function sendMetaCapi(ev: CapiEvent): Promise<void> {
  try {
    const [pixel, token] = await Promise.all([
      getSecret("META_PIXEL_ID"),
      getSecret("META_CAPI_TOKEN"),
    ]);
    if (!pixel || !token) return;

    const user_data: Record<string, unknown> = {};
    if (ev.email) user_data.em = [await sha256Hex(ev.email.trim().toLowerCase())];
    if (ev.fbp) user_data.fbp = ev.fbp;
    if (ev.fbc) user_data.fbc = ev.fbc;

    const event: Record<string, unknown> = {
      event_name: ev.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: ev.eventId,
      action_source: "website",
      event_source_url: ev.url ?? "https://seekerai.digital",
      user_data,
    };
    if (ev.valueReais != null) {
      event.custom_data = { value: ev.valueReais, currency: ev.currency ?? "BRL" };
    }

    const body: Record<string, unknown> = { data: [event] };
    const testCode = await getSecret("META_TEST_EVENT_CODE");
    if (testCode) body.test_event_code = testCode;

    await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => null);
  } catch { /* tracking nunca derruba request */ }
}

/** Compra confirmada (qualquer método) → evento Purchase no Pixel.
 *  Recebe a linha do payments — email, valor e cookies fb do metadata. */
export async function trackPurchase(payment: {
  id: string;
  user_id: string;
  amount_cents: number;
  metadata: unknown;
}): Promise<void> {
  const meta = isRecord(payment.metadata) ? payment.metadata : {};
  const fb = isRecord(meta.fb) ? meta.fb : {};
  let email: string | null = null;
  try {
    const { data } = await serviceClient()
      .from("profiles").select("email").eq("id", payment.user_id).maybeSingle();
    email = typeof data?.email === "string" ? data.email : null;
  } catch { email = null; }
  await sendMetaCapi({
    eventName: "Purchase",
    eventId: payment.id,
    email,
    valueReais: payment.amount_cents / 100,
    currency: typeof meta.currency === "string" ? meta.currency : "BRL",
    fbp: typeof fb.fbp === "string" ? fb.fbp : null,
    fbc: typeof fb.fbc === "string" ? fb.fbc : null,
    url: "https://seekerai.digital/app/planos",
  });
}
