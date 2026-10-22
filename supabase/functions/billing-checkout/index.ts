// Cria cobrança de assinatura (cartão via Stripe Checkout) ou PIX (MercosulPay).
// Requer JWT do usuário. O plano precisa estar ativo (admin ativa o billing).
// Secrets do provedor ficam no Supabase — nunca no servidor web.

import {
  fail,
  httpError,
  isRecord,
  json,
  optionalEnv,
  readJson,
  requirePost,
  requireUser,
  serviceClient,
} from "../_shared/common.ts";
import { requireSecret } from "../_shared/secrets.ts";

const APP_URL = optionalEnv("APP_URL") ?? "https://seekerai.digital";
// API pública MercosulPay (mesmo contrato do projeto iastetic).
const MERCOSUL_API_URL = "https://mercosulpay.com/api/public/v1";

interface CheckoutBody {
  planSlug?: string;
  method?: string;
  creditPack?: boolean;
  currency?: string;
}

type BillingCurrency = "brl" | "usd" | "eur";

// Preços para fora do Brasil: Essential $5/€5 · Pro $15/€15 · King $25/€25.
// O número é o mesmo em USD e EUR (conforme regra de negócio).
const INTL_PRICES: Record<string, number> = {
  essencial: 500,
  pro: 1500,
  king: 2500,
};

// Pacote avulso: +50 créditos por R$20 no BR, $4/€4 fora (soma no saldo — não é assinatura).
const CREDIT_PACK = { credits: 50, amountCents: 2000, intlCents: 400, label: "SeekerAi — +50 créditos" };

async function createStripePackSession(
  userId: string,
  email: string | null,
  currency: BillingCurrency,
): Promise<{ id: string; url: string }> {
  const amountCents = currency === "brl" ? CREDIT_PACK.amountCents : CREDIT_PACK.intlCents;
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": CREDIT_PACK.label,
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "metadata[user_id]": userId,
    "metadata[kind]": "credit_pack",
    "metadata[currency]": currency,
    success_url: `${APP_URL}/app?checkout=creditos`,
    cancel_url: `${APP_URL}/app/planos?checkout=cancelado`,
  });
  if (email) params.set("customer_email", email);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await requireSecret("STRIPE_SECRET_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[stripe] pack checkout falhou:", res.status);
    throw httpError(502, "Stripe recusou a criação do checkout");
  }
  const url = typeof data.url === "string" ? data.url : null;
  const id = typeof data.id === "string" ? data.id : null;
  if (!url || !id) throw httpError(502, "Resposta inesperada do Stripe");
  return { id, url };
}

async function createMercosulPackPix(internalRef: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${MERCOSUL_API_URL}/pix/charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await requireSecret("MERCOSULPAY_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: CREDIT_PACK.amountCents / 100,
      currency: "BRL",
      description: CREDIT_PACK.label,
      reference_id: internalRef,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[mercosulpay] pack PIX falhou:", res.status);
    throw httpError(502, "MercosulPay recusou a criação do PIX");
  }
  return isRecord(data.data) ? data.data : data;
}

async function createStripeSession(
  plan: { id: string; slug: string; nome: string; preco_centavos: number },
  userId: string,
  email: string | null,
  currency: BillingCurrency,
  amountCents: number,
): Promise<{ id: string; url: string }> {
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": `SeekerAi — ${plan.nome}`,
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "metadata[user_id]": userId,
    "metadata[plan_id]": plan.id,
    "metadata[plan_slug]": plan.slug,
    "metadata[currency]": currency,
    "subscription_data[metadata][user_id]": userId,
    "subscription_data[metadata][plan_id]": plan.id,
    success_url: `${APP_URL}/app?checkout=sucesso`,
    cancel_url: `${APP_URL}/planos?checkout=cancelado`,
  });
  if (email) params.set("customer_email", email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await requireSecret("STRIPE_SECRET_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[stripe] checkout falhou:", res.status);
    throw httpError(502, "Stripe recusou a criação do checkout");
  }
  const url = typeof data.url === "string" ? data.url : null;
  const id = typeof data.id === "string" ? data.id : null;
  if (!url || !id) throw httpError(502, "Resposta inesperada do Stripe");
  return { id, url };
}

async function createMercosulPix(
  plan: { id: string; slug: string; nome: string; preco_centavos: number },
  internalRef: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${MERCOSUL_API_URL}/pix/charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await requireSecret("MERCOSULPAY_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: plan.preco_centavos / 100,
      currency: "BRL",
      description: `SeekerAi — ${plan.nome}`.slice(0, 200),
      reference_id: internalRef,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[mercosulpay] cobrança PIX falhou:", res.status);
    throw httpError(502, "MercosulPay recusou a criação do PIX");
  }
  return isRecord(data.data) ? data.data : data;
}

function pickDeep(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (isRecord(value)) {
      const nested = pickDeep(value, keys);
      if (nested) return nested;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    requirePost(req);
    const user = await requireUser(req);
    const body = await readJson<CheckoutBody>(req);

    const method = body.method === "pix" ? "pix" : body.method === "card" ? "card" : null;
    if (!method) throw httpError(400, "Informe method (card|pix)");
    const currency: BillingCurrency =
      body.currency === "usd" || body.currency === "eur" ? body.currency : "brl";
    // Fora do Brasil: PIX é método brasileiro — só cartão via Stripe.
    if (currency !== "brl" && method === "pix") {
      throw httpError(400, "PIX is only available in Brazil — use card");
    }
    const db = serviceClient();

    // Pacote avulso de créditos — só para quem já tem assinatura ativa.
    if (body.creditPack === true) {
      const { data: sub } = await db.from("subscriptions")
        .select("id").eq("user_id", user.id)
        .in("status", ["active", "past_due"]).limit(1).maybeSingle();
      if (!sub) throw httpError(403, "Pacote de créditos disponível só para assinantes");
      const internalRef = crypto.randomUUID();
      const { error } = await db.from("payments").insert({
        user_id: user.id,
        plan_id: null,
        provider: method === "card" ? "stripe" : "mercosulpay",
        provider_ref: internalRef,
        method,
        amount_cents: currency === "brl" ? CREDIT_PACK.amountCents : CREDIT_PACK.intlCents,
        status: "pending",
        metadata: { kind: "credit_pack", credits: CREDIT_PACK.credits, currency },
      });
      if (error) throw httpError(500, `Falha ao registrar pagamento: ${error.message}`);

      if (method === "card") {
        // provider_ref do Stripe precisa ser o id da sessão — o webhook casa por ele.
        const session = await createStripePackSession(user.id, null, currency);
        await db.from("payments")
          .update({ provider_ref: session.id })
          .eq("provider", "stripe").eq("provider_ref", internalRef);
        return json({ provider: "stripe", method, checkoutUrl: session.url });
      }
      try {
        const charge = await createMercosulPackPix(internalRef);
        return json({
          provider: "mercosulpay", method, reference: internalRef,
          qrCode: pickDeep(charge, ["qr_code", "qrCode", "emv", "pix_copy_paste"]),
          qrCodeImage: pickDeep(charge, ["qr_code_image", "qrCodeBase64"]),
          expiresAt: pickDeep(charge, ["expires_at", "expiration", "expiresAt"]),
        });
      } catch (err) {
        await db.from("payments").update({ status: "failed" })
          .eq("provider", "mercosulpay").eq("provider_ref", internalRef);
        throw err;
      }
    }

    const planSlug = typeof body.planSlug === "string" ? body.planSlug.trim() : "";
    if (!planSlug) throw httpError(400, "Informe planSlug");
    const { data: plan, error: planError } = await db
      .from("plans")
      .select("id, slug, nome, preco_centavos, ativo")
      .eq("slug", planSlug)
      .maybeSingle();
    if (planError || !plan) throw httpError(404, "Plano não encontrado");
    if (!plan.ativo || plan.preco_centavos <= 0) {
      throw httpError(409, "Este plano ainda não está disponível para contratação");
    }

    const { data: active } = await db
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "active", "past_due"])
      .limit(1);
    if (active && active.length > 0) {
      throw httpError(409, "Você já possui uma assinatura em andamento");
    }

    // Preço cobrado: BRL usa o preço do banco; USD/EUR usam a tabela internacional.
    const amountCents = currency === "brl"
      ? plan.preco_centavos
      : INTL_PRICES[plan.slug];
    if (!amountCents) {
      throw httpError(409, "Este plano não está disponível nesta região");
    }

    if (method === "card") {
      const session = await createStripeSession(plan, user.id, null, currency, amountCents);
      const { error } = await db.from("payments").insert({
        user_id: user.id,
        plan_id: plan.id,
        provider: "stripe",
        provider_ref: session.id,
        method: "card",
        amount_cents: amountCents,
        status: "pending",
        metadata: { currency },
      });
      if (error) throw httpError(500, `Falha ao registrar pagamento: ${error.message}`);
      return json({ provider: "stripe", method, checkoutUrl: session.url });
    }

    // PIX — provider_ref é a nossa referência interna, ecoada pelo webhook.
    const internalRef = crypto.randomUUID();
    const { error } = await db.from("payments").insert({
      user_id: user.id,
      plan_id: plan.id,
      provider: "mercosulpay",
      provider_ref: internalRef,
      method: "pix",
      amount_cents: plan.preco_centavos,
      status: "pending",
    });
    if (error) throw httpError(500, `Falha ao registrar pagamento: ${error.message}`);

    try {
      const charge = await createMercosulPix(plan, internalRef);
      return json({
        provider: "mercosulpay",
        method,
        reference: internalRef,
        qrCode: pickDeep(charge, ["qr_code", "qrCode", "emv", "pix_copy_paste"]),
        qrCodeImage: pickDeep(charge, ["qr_code_image", "qrCodeBase64"]),
        expiresAt: pickDeep(charge, ["expires_at", "expiration", "expiresAt"]),
      });
    } catch (err) {
      await db.from("payments")
        .update({ status: "failed" })
        .eq("provider", "mercosulpay")
        .eq("provider_ref", internalRef);
      throw err;
    }
  } catch (err) {
    return fail(err);
  }
});
