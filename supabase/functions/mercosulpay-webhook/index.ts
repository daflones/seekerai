// Webhook MercosulPay → Edge Function (sem JWT: a assinatura é a auth).
// Deploy: supabase functions deploy mercosulpay-webhook --no-verify-jwt
// URL:    https://<ref>.supabase.co/functions/v1/mercosulpay-webhook
//
// Contrato real (igual ao projeto iastetic):
//   x-mercosulpay-timestamp: <epoch_s>
//   x-mercosulpay-signature: sha256=<hmac_sha256(secret, `${ts}.${rawBody}`)>
//   x-mercosulpay-event:     pix.received | pix.sent | pix.refunded | ...
//   x-mercosulpay-delivery:  <id único da entrega> (dedup)
//   payload.data.reference_id = nosso UUID interno (payments.provider_ref)

import {
  fail,
  hmacSha256Hex,
  httpError,
  isRecord,
  json,
  requirePost,
  serviceClient,
  timingSafeEqual,
} from "../_shared/common.ts";
import { requireSecret } from "../_shared/secrets.ts";

const TOLERANCE_SECONDS = 300;
const UUID_RE = /^[-0-9a-f]{36}$/i;

async function verifySignature(req: Request, rawBody: string) {
  const secret = await requireSecret("MERCOSULPAY_WEBHOOK_SECRET");
  const ts = req.headers.get("x-mercosulpay-timestamp") ?? "";
  const sig = req.headers.get("x-mercosulpay-signature") ?? "";
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_SECONDS) {
    throw httpError(401, "Entrega expirada");
  }
  const expected = `sha256=${await hmacSha256Hex(secret, `${ts}.${rawBody}`)}`;
  if (!timingSafeEqual(expected, sig)) throw httpError(401, "Assinatura inválida");
  return {
    eventType: req.headers.get("x-mercosulpay-event") ?? "unknown",
    deliveryId: req.headers.get("x-mercosulpay-delivery") ?? "",
  };
}

Deno.serve(async (req) => {
  try {
    requirePost(req);
    const rawBody = await req.text();
    const { eventType, deliveryId } = await verifySignature(req, rawBody);
    if (!deliveryId) throw httpError(400, "Entrega sem id");

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const db = serviceClient();
    const { data: state, error: ingestError } = await db.rpc("ingest_webhook_event", {
      p_provider: "mercosulpay",
      p_event_id: deliveryId,
      p_event_type: eventType,
      p_payload: payload,
    });
    if (ingestError) throw httpError(500, `ingest_webhook_event: ${ingestError.message}`);
    if (state === "processed") return json({ received: true, duplicate: true });

    let processError: string | null = null;
    try {
      const data = isRecord(payload.data) ? payload.data
        : isRecord(payload.object) ? payload.object
        : payload;
      const reference = typeof data.reference_id === "string" ? data.reference_id : null;

      if (eventType === "pix.received") {
        if (!reference || !UUID_RE.test(reference)) {
          throw httpError(400, "Referência inválida");
        }
        const { data: payment } = await db
          .from("payments")
          .select("id, amount_cents, status, provider")
          .eq("provider", "mercosulpay")
          .eq("provider_ref", reference)
          .maybeSingle();
        if (!payment) throw httpError(404, "Pagamento desconhecido");

        const paidCents = typeof data.amount === "number"
          ? Math.round(data.amount * 100)
          : null;
        const chargeCompleted = String(data.status ?? "") === "completed";
        if (!chargeCompleted) {
          await finish(db, deliveryId, `charge_status:${data.status}`);
          return json({ received: true, result: { status: "ignored" } });
        }
        if (paidCents !== null && paidCents !== payment.amount_cents) {
          // Valor divergente → revisão manual, sem conceder créditos.
          await db.from("payments").update({ status: "review" }).eq("id", payment.id);
          await finish(db, deliveryId, "amount_mismatch_review");
          return json({ received: true, result: { status: "review" } });
        }

        const periodEnd = new Date(Date.now() + 32 * 24 * 3600 * 1000).toISOString();
        const { data: result, error } = await db.rpc("confirm_plan_payment", {
          p_provider: "mercosulpay",
          p_provider_ref: reference,
          p_provider_subscription_id: null,
          p_period_end: periodEnd,
          p_cycle_ref: `mercosul:${reference}`,
        });
        if (error) throw httpError(500, `confirm_plan_payment: ${error.message}`);
        await finish(db, deliveryId, null);
        return json({ received: true, result });
      }

      if (eventType === "pix.refunded" && reference && UUID_RE.test(reference)) {
        await db.from("payments")
          .update({ status: "review" })
          .eq("provider", "mercosulpay")
          .eq("provider_ref", reference)
          .eq("status", "paid");
        await finish(db, deliveryId, null);
        return json({ received: true, result: { status: "review" } });
      }

      await finish(db, deliveryId, null);
      return json({ received: true, result: { status: "ignored", eventType } });
    } catch (err) {
      processError = err instanceof Error ? err.message : String(err);
      await finish(db, deliveryId, processError);
      throw err;
    }
  } catch (err) {
    return fail(err);
  }
});

async function finish(
  db: ReturnType<typeof serviceClient>,
  deliveryId: string,
  error: string | null,
) {
  await db.rpc("finish_webhook_event", {
    p_provider: "mercosulpay",
    p_event_id: deliveryId,
    p_error: error,
  });
}
