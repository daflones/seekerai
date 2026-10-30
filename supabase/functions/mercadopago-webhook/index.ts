// Webhook Mercado Pago → Edge Function (sem JWT: a assinatura + consulta
// à API do MP são a auth).
// Deploy: supabase functions deploy mercadopago-webhook --no-verify-jwt
// URL:    https://<ref>.supabase.co/functions/v1/mercadopago-webhook
//
// Contrato MP:
//   POST { id, live_mode, type: "payment", action: "payment.created|updated",
//          data: { id: "<payment_id>" } }
//   ou ?topic=payment&id=<id> / ?type=payment&data.id=<id>
//   x-signature: ts=<epoch>,v1=<hmac> · x-request-id: <uuid>
//   manifesto assinado: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
//   external_reference = nosso payments.provider_ref (UUID interno)

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
import { getSecret, requireSecret } from "../_shared/secrets.ts";
import { notifyError, notifySale, notifyUserOf } from "../_shared/notify.ts";
import { trackPlanSignup, trackPurchase } from "../_shared/meta.ts";

const TOLERANCE_SECONDS = 300;
const MP_API_URL = "https://api.mercadopago.com";

// Assinatura só é exigida quando o secret está configurado no painel MP —
// sem ele, a própria consulta GET /v1/payments/{id} valida a notificação.
async function verifyMpSignature(req: Request, paymentId: string): Promise<void> {
  const secret = await getSecret("MERCADOPAGO_WEBHOOK_SECRET");
  if (!secret) return;
  const header = req.headers.get("x-signature") ?? "";
  const ts = header.split(",").find((p) => p.trim().startsWith("ts="))?.slice(3).trim() ?? "";
  const v1 = header.split(",").find((p) => p.trim().startsWith("v1="))?.slice(3).trim() ?? "";
  if (!ts || !v1) throw httpError(401, "Assinatura ausente");
  if (!Number.isFinite(Number(ts)) || Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_SECONDS) {
    throw httpError(401, "Entrega expirada");
  }
  const manifest = `id:${paymentId};request-id:${req.headers.get("x-request-id") ?? ""};ts:${ts};`;
  const expected = await hmacSha256Hex(secret, manifest);
  if (!timingSafeEqual(expected, v1)) throw httpError(401, "Assinatura inválida");
}

async function mpGetPayment(paymentId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${MP_API_URL}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${await requireSecret("MERCADOPAGO_ACCESS_TOKEN")}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw httpError(502, `Mercado Pago respondeu ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  let notifyCtx = { onde: "mercadopago-webhook", contexto: "" as string };
  try {
    requirePost(req);
    const url = new URL(req.url);
    const rawBody = await req.text();
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(rawBody) as Record<string, unknown>; } catch { /* notificações de ping chegam vazias */ }

    const dataObj = isRecord(payload.data) ? payload.data : {};
    const paymentId = String(
      dataObj.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "",
    );
    const topic = String(
      payload.type ?? payload.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "",
    );
    const action = String(payload.action ?? topic ?? "payment");
    notifyCtx.contexto = `evento ${action} · pagamento ${paymentId}`;

    // Só eventos de pagamento nos interessam — merchant_order e afins são ignorados.
    if (topic && topic !== "payment") return json({ received: true, result: { status: "ignored", topic } });
    if (!paymentId) throw httpError(400, "Notificação sem id de pagamento");

    await verifyMpSignature(req, paymentId);

    const db = serviceClient();
    const eventId = `mp:${String(payload.id ?? `${action}:${paymentId}`)}`;
    const { data: state, error: ingestError } = await db.rpc("ingest_webhook_event", {
      p_provider: "mercadopago",
      p_event_id: eventId,
      p_event_type: action,
      p_payload: { ...payload, query: Object.fromEntries(url.searchParams) },
    });
    if (ingestError) throw httpError(500, `ingest_webhook_event: ${ingestError.message}`);
    if (state === "processed") return json({ received: true, duplicate: true });

    let processError: string | null = null;
    try {
      const mpPay = await mpGetPayment(paymentId);
      const status = String(mpPay.status ?? "");
      const externalRef = typeof mpPay.external_reference === "string"
        ? mpPay.external_reference : null;

      const { data: payment } = externalRef
        ? await db.from("payments")
          .select("id, user_id, plan_id, amount_cents, status, provider, metadata")
          .eq("provider", "mercadopago")
          .eq("provider_ref", externalRef)
          .maybeSingle()
        : { data: null };

      // Cobrança de outro sistema na mesma conta MP — não é nossa.
      if (!payment) {
        await finish(db, eventId, null);
        return json({ received: true, result: { status: "ignored", reason: "unknown_reference" } });
      }

      if (status === "approved") {
        const paidCents = typeof mpPay.transaction_amount === "number"
          ? Math.round(mpPay.transaction_amount * 100) : null;

        if (paidCents !== null && paidCents !== payment.amount_cents) {
          // Valor divergente → revisão manual, sem conceder créditos.
          await db.from("payments").update({ status: "review" }).eq("id", payment.id);
          await notifySale({
            tipo: "revisao",
            valorReais: paidCents !== null ? paidCents / 100 : payment.amount_cents / 100,
            descricao: `Pagamento Mercado Pago com valor divergente (esperado R$ ${(payment.amount_cents / 100).toFixed(2)}) — marcado pra revisão manual`,
            usuario: await notifyUserOf(payment.user_id),
          });
          await finish(db, eventId, "amount_mismatch_review");
          return json({ received: true, result: { status: "review" } });
        }

        const meta = isRecord(payment.metadata) ? payment.metadata : {};

        if (meta.kind === "domain") {
          const { data: result, error } = await db.rpc("confirm_domain_payment", {
            p_provider: "mercadopago",
            p_provider_ref: externalRef,
          });
          if (error) throw httpError(500, `confirm_domain_payment: ${error.message}`);
          await trackPurchase(payment);
          await finish(db, eventId, null);
          return json({ received: true, result });
        }

        if (meta.kind === "credit_pack") {
          const { data: result, error } = await db.rpc("confirm_credit_pack_payment", {
            p_provider: "mercadopago",
            p_provider_ref: externalRef,
          });
          if (error) throw httpError(500, `confirm_credit_pack_payment: ${error.message}`);
          await trackPurchase(payment);
          const credits = Number(meta.credits ?? meta.creditos ?? 0) || null;
          await notifySale({
            tipo: "recarga",
            valorReais: payment.amount_cents / 100,
            descricao: `Recarga de créditos no cartão (Mercado Pago)${credits ? ` — ${credits} créditos` : ""}`,
            usuario: await notifyUserOf(payment.user_id),
          });
          await finish(db, eventId, null);
          return json({ received: true, result });
        }

        // Plano — período comprado define vencimento e meses de cota.
        const months = Math.min(24, Math.max(1, Number(meta.months ?? 1) || 1));
        const periodEnd = (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + months);
          return d.toISOString();
        })();
        const { data: result, error } = await db.rpc("confirm_plan_payment", {
          p_provider: "mercadopago",
          p_provider_ref: externalRef,
          p_provider_subscription_id: null,
          p_period_end: periodEnd,
          p_cycle_ref: `mercadopago:${paymentId}`,
          p_months: months,
        });
        if (error) throw httpError(500, `confirm_plan_payment: ${error.message}`);
        await trackPlanSignup(payment);
        const { data: plan } = await db.from("plans").select("*").eq("id", payment.plan_id).maybeSingle();
        const planNome = isRecord(plan) ? String(plan.nome ?? plan.name ?? "plano") : "plano";
        await notifySale({
          tipo: "assinatura",
          valorReais: payment.amount_cents / 100,
          descricao: `Nova assinatura no cartão (Mercado Pago) — plano ${planNome}`,
          usuario: await notifyUserOf(payment.user_id),
        });
        await finish(db, eventId, null);
        return json({ received: true, result });
      }

      if (status === "rejected" || status === "cancelled") {
        await db.from("payments").update({ status: "failed" })
          .eq("id", payment.id).eq("status", "pending");
        await finish(db, eventId, null);
        return json({ received: true, result: { status: "failed", mpStatus: status } });
      }

      if (status === "refunded" || status === "charged_back") {
        const { data: refunded } = await db.from("payments")
          .update({ status: "review" })
          .eq("id", payment.id).eq("status", "paid")
          .select("user_id, amount_cents").maybeSingle();
        if (refunded) {
          await notifySale({
            tipo: "reembolso",
            valorReais: refunded.amount_cents / 100,
            descricao: `Pagamento Mercado Pago ${status === "charged_back" ? "com chargeback" : "reembolsado"} — marcado pra revisão`,
            usuario: await notifyUserOf(refunded.user_id),
          });
        }
        await finish(db, eventId, null);
        return json({ received: true, result: { status: "review", mpStatus: status } });
      }

      // pending / in_process / authorized — segue aguardando confirmação.
      await finish(db, eventId, null);
      return json({ received: true, result: { status: "ignored", mpStatus: status } });
    } catch (err) {
      processError = err instanceof Error ? err.message : String(err);
      await finish(db, eventId, processError);
      throw err;
    }
  } catch (err) {
    await notifyError({
      ...notifyCtx,
      erro: err instanceof Error ? err.message : String(err),
    });
    return fail(err);
  }
});

async function finish(
  db: ReturnType<typeof serviceClient>,
  eventId: string,
  error: string | null,
) {
  await db.rpc("finish_webhook_event", {
    p_provider: "mercadopago",
    p_event_id: eventId,
    p_error: error,
  });
}
