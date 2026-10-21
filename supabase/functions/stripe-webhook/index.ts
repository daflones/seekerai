// Webhook Stripe → Supabase Edge Function (sem JWT: a assinatura é a auth).
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// URL:    https://<ref>.supabase.co/functions/v1/stripe-webhook

import {
  fail,
  hmacSha256Hex,
  httpError,
  isRecord,
  json,
  requireEnv,
  requirePost,
  serviceClient,
  timingSafeEqual,
} from "../_shared/common.ts";

const SIGNATURE_TOLERANCE_SECONDS = 300;

function parseSignatureHeader(header: string): { ts: string; signatures: string[] } {
  const ts = header.split(",").find((p) => p.startsWith("t="))?.slice(2) ?? "";
  const signatures = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  return { ts, signatures };
}

async function verifyStripeSignature(rawBody: string, header: string | null): Promise<void> {
  if (!header) throw httpError(401, "Assinatura ausente");
  const { ts, signatures } = parseSignatureHeader(header);
  if (!ts || signatures.length === 0) throw httpError(401, "Assinatura malformada");
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
    throw httpError(401, "Assinatura expirada");
  }
  const expected = await hmacSha256Hex(requireEnv("STRIPE_WEBHOOK_SECRET"), `${ts}.${rawBody}`);
  if (!signatures.some((sig) => timingSafeEqual(sig, expected))) {
    throw httpError(401, "Assinatura inválida");
  }
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${requireEnv("STRIPE_SECRET_KEY")}` },
  });
  if (!res.ok) throw httpError(502, `Stripe respondeu ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

const epochToIso = (v: unknown): string | null =>
  typeof v === "number" && v > 0 ? new Date(v * 1000).toISOString() : null;

async function processEvent(
  db: ReturnType<typeof serviceClient>,
  event: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const type = String(event.type ?? "");
  const object = isRecord(event.data) && isRecord(event.data.object) ? event.data.object : {};

  if (type === "checkout.session.completed") {
    const sessionId = String(object.id ?? "");
    const subscriptionId = typeof object.subscription === "string" ? object.subscription : null;
    if (!sessionId) return { status: "ignored", reason: "no_session_id" };

    let periodStart: number | null = null;
    let periodEnd: string | null = null;
    if (subscriptionId) {
      const sub = await stripeGet(`subscriptions/${subscriptionId}`);
      periodStart = typeof sub.current_period_start === "number" ? sub.current_period_start : null;
      periodEnd = epochToIso(sub.current_period_end);
    }
    const cycleRef = `stripe:${subscriptionId ?? sessionId}:${periodStart ?? "checkout"}`;
    const { data, error } = await db.rpc("confirm_plan_payment", {
      p_provider: "stripe",
      p_provider_ref: sessionId,
      p_provider_subscription_id: subscriptionId,
      p_period_end: periodEnd,
      p_cycle_ref: cycleRef,
    });
    if (error) throw httpError(500, `confirm_plan_payment: ${error.message}`);
    return data as Record<string, unknown>;
  }

  if (type === "invoice.paid" && object.billing_reason === "subscription_cycle") {
    const subscriptionId = typeof object.subscription === "string" ? object.subscription : null;
    const invoiceId = String(object.id ?? "");
    if (!subscriptionId || !invoiceId) return { status: "ignored", reason: "incomplete_invoice" };

    const lines = isRecord(object.lines) && Array.isArray(object.lines.data)
      ? object.lines.data
      : [];
    const period = isRecord(lines[0]) && isRecord(lines[0].period) ? lines[0].period : {};
    const periodStart = typeof period.start === "number" ? period.start : null;
    const periodEnd = epochToIso(period.end);

    const { data, error } = await db.rpc("record_renewal_payment", {
      p_provider: "stripe",
      p_provider_subscription_id: subscriptionId,
      p_payment_ref: invoiceId,
      p_amount_cents: typeof object.amount_paid === "number" ? object.amount_paid : 0,
      p_period_end: periodEnd,
      p_cycle_ref: `stripe:${subscriptionId}:${periodStart ?? invoiceId}`,
    });
    if (error) throw httpError(500, `record_renewal_payment: ${error.message}`);
    return data as Record<string, unknown>;
  }

  if (type === "customer.subscription.deleted") {
    const subscriptionId = String(object.id ?? "");
    if (!subscriptionId) return { status: "ignored", reason: "no_subscription_id" };
    const { data, error } = await db.rpc("cancel_provider_subscription", {
      p_provider: "stripe",
      p_provider_subscription_id: subscriptionId,
    });
    if (error) throw httpError(500, `cancel_provider_subscription: ${error.message}`);
    return data as Record<string, unknown>;
  }

  return { status: "ignored", reason: `unhandled:${type}` };
}

Deno.serve(async (req) => {
  try {
    requirePost(req);
    const rawBody = await req.text();
    await verifyStripeSignature(rawBody, req.headers.get("Stripe-Signature"));

    const event = JSON.parse(rawBody) as Record<string, unknown>;
    const eventId = String(event.id ?? "");
    const eventType = String(event.type ?? "unknown");
    if (!eventId) throw httpError(400, "Evento sem id");

    const db = serviceClient();
    const { data: state, error: ingestError } = await db.rpc("ingest_webhook_event", {
      p_provider: "stripe",
      p_event_id: eventId,
      p_event_type: eventType,
      p_payload: event,
    });
    if (ingestError) throw httpError(500, `ingest_webhook_event: ${ingestError.message}`);
    if (state === "processed") return json({ received: true, duplicate: true });

    let result: Record<string, unknown>;
    let processError: string | null = null;
    try {
      result = await processEvent(db, event);
    } catch (err) {
      processError = err instanceof Error ? err.message : String(err);
      await db.rpc("finish_webhook_event", {
        p_provider: "stripe",
        p_event_id: eventId,
        p_error: processError,
      });
      throw err;
    }
    await db.rpc("finish_webhook_event", {
      p_provider: "stripe",
      p_event_id: eventId,
      p_error: null,
    });
    return json({ received: true, result });
  } catch (err) {
    return fail(err);
  }
});
