// Webhook MercosulPay → Supabase Edge Function (sem JWT: assinatura é a auth).
// Deploy: supabase functions deploy mercosulpay-webhook --no-verify-jwt
// URL:    https://<ref>.supabase.co/functions/v1/mercosulpay-webhook
//
// Verificação: tenta os dois formatos comuns em gateways BR —
//   1) X-Hub-Signature-256: sha256=<hmac(body)> (chave = secret; se o secret
//      for hex de 64 chars, também tenta decodificado)
//   2) x-signature: ts=...,v1=<hmac("id:{data.id};request-id:{x-request-id};ts:{ts};")>
// Se o painel Mercosul usar outro esquema, o primeiro evento real revela —
// ajuste apenas verifySignature().

import {
  fail,
  hexToBytes,
  hmacSha256Hex,
  httpError,
  isRecord,
  json,
  requireEnv,
  requirePost,
  serviceClient,
  timingSafeEqual,
} from "../_shared/common.ts";

const PAID_STATUSES = new Set([
  "approved", "paid", "confirmed", "completed", "settled", "authorized",
]);

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
    if (isRecord(value)) {
      const nested = pick(value, ["external_reference", "ref", "reference", "external_id", "id"]);
      if (nested) return nested;
    }
  }
  return null;
}

async function verifySignature(req: Request, rawBody: string): Promise<void> {
  const secret = requireEnv("MERCOSULPAY_WEBHOOK_SECRET");

  const hubHeader = req.headers.get("x-hub-signature-256");
  if (hubHeader?.startsWith("sha256=")) {
    const given = hubHeader.slice(7);
    const candidates = [await hmacSha256Hex(secret, rawBody)];
    if (/^[0-9a-f]{64}$/i.test(secret)) {
      candidates.push(await hmacSha256Hex(hexToBytes(secret), rawBody));
    }
    if (candidates.some((sig) => timingSafeEqual(sig, given))) return;
    throw httpError(401, "Assinatura inválida");
  }

  const mpHeader = req.headers.get("x-signature");
  if (mpHeader) {
    const ts = mpHeader.split(",").find((p) => p.startsWith("ts="))?.slice(2);
    const v1 = mpHeader.split(",").find((p) => p.startsWith("v1="))?.slice(3);
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const dataId = pick(isRecord(body.data) ? body.data : body, ["id"]) ?? "";
    const requestId = req.headers.get("x-request-id") ?? "";
    if (ts && v1) {
      const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
      const expected = await hmacSha256Hex(secret, manifest);
      if (timingSafeEqual(v1, expected)) return;
    }
    throw httpError(401, "Assinatura inválida");
  }

  throw httpError(401, "Assinatura ausente");
}

/** Extrai a referência que bate com payments.provider_ref criado no checkout
 *  (a nossa referência interna volta como external_reference/metadata). */
function extractPaymentRef(body: Record<string, unknown>): string | null {
  return pick(body, [
    "external_reference", "reference", "metadata",
    "payment_id", "transaction_id", "charge_id", "id", "data", "payment",
  ]);
}

async function processEvent(
  db: ReturnType<typeof serviceClient>,
  body: Record<string, unknown>,
  eventType: string,
): Promise<Record<string, unknown>> {
  const status = String(body.status ?? "").toLowerCase();
  const isPaid =
    PAID_STATUSES.has(status) ||
    /paid|approved|confirm/i.test(eventType);
  if (!isPaid) {
    return { status: "ignored", reason: `not_paid:${status || eventType}` };
  }

  const ref = extractPaymentRef(body);
  if (!ref) return { status: "ignored", reason: "no_payment_ref" };

  const periodEnd = new Date(Date.now() + 32 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db.rpc("confirm_plan_payment", {
    p_provider: "mercosulpay",
    p_provider_ref: ref,
    p_provider_subscription_id: null,
    p_period_end: periodEnd,
    p_cycle_ref: `mercosul:${ref}`,
  });
  if (error) throw httpError(500, `confirm_plan_payment: ${error.message}`);
  return data as Record<string, unknown>;
}

Deno.serve(async (req) => {
  try {
    requirePost(req);
    const rawBody = await req.text();
    await verifySignature(req, rawBody);

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const eventType = String(body.event ?? body.type ?? body.action ?? "unknown");
    const ref = extractPaymentRef(body);
    const eventId = String(body.event_id ?? body.notification_id ?? (ref ? `${eventType}:${ref}` : ""));
    if (!eventId) throw httpError(400, "Evento sem id");

    const db = serviceClient();
    const { data: state, error: ingestError } = await db.rpc("ingest_webhook_event", {
      p_provider: "mercosulpay",
      p_event_id: eventId,
      p_event_type: eventType,
      p_payload: body,
    });
    if (ingestError) throw httpError(500, `ingest_webhook_event: ${ingestError.message}`);
    if (state === "processed") return json({ received: true, duplicate: true });

    let result: Record<string, unknown>;
    try {
      result = await processEvent(db, body, eventType);
    } catch (err) {
      await db.rpc("finish_webhook_event", {
        p_provider: "mercosulpay",
        p_event_id: eventId,
        p_error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    await db.rpc("finish_webhook_event", {
      p_provider: "mercosulpay",
      p_event_id: eventId,
      p_error: null,
    });
    return json({ received: true, result });
  } catch (err) {
    return fail(err);
  }
});
