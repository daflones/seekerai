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
  packId?: string;
  currency?: string;
  period?: string;
  domainSiteSlug?: string;
  domainHost?: string;
  fbp?: string;
  fbc?: string;
}

type BillingCurrency = "brl" | "usd" | "eur";

// Período de cobrança — mesmos fatores do front (lib/plans/periods.ts).
const PERIODS: Record<string, { months: number; discount: number; label: string }> = {
  mensal: { months: 1, discount: 0, label: "mensal" },
  trimestral: { months: 3, discount: 0.10, label: "trimestral" },
  anual: { months: 12, discount: 0.20, label: "anual" },
};

// Preços para fora do Brasil: Essential $5/€5 · Pro $15/€15 · King $25/€25.
// O número é o mesmo em USD e EUR (conforme regra de negócio).
const INTL_PRICES: Record<string, number> = {
  essencial: 500,
  pro: 1500,
  king: 2500,
};

// Pacotes avulsos de créditos — somam no saldo (não é assinatura).
// Os mesmos ids/valores do front (lib/i18n/shared.ts CREDIT_PACKS).
const CREDIT_PACKS: Record<string, { credits: number; amountCents: number; intlCents: number }> = {
  pack50: { credits: 50, amountCents: 3997, intlCents: 799 },
  pack150: { credits: 150, amountCents: 8997, intlCents: 1999 },
  pack250: { credits: 250, amountCents: 12997, intlCents: 2999 },
};

async function createStripePackSession(
  userId: string,
  email: string | null,
  currency: BillingCurrency,
  pack: { credits: number; amountCents: number; intlCents: number },
): Promise<{ id: string; url: string }> {
  const amountCents = currency === "brl" ? pack.amountCents : pack.intlCents;
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": `SeekerAi — +${pack.credits} créditos`,
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "metadata[user_id]": userId,
    "metadata[kind]": "credit_pack",
    "metadata[credits]": String(pack.credits),
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

async function createStripeDomainSession(
  userId: string,
  amountCents: number,
  host: string,
): Promise<{ id: string; url: string }> {
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "brl",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": `SeekerAi — Domínio ${host} (1 ano)`.slice(0, 200),
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "metadata[user_id]": userId,
    "metadata[kind]": "domain",
    "metadata[domain_host]": host,
    success_url: `${APP_URL}/app/dominios?checkout=dominio`,
    cancel_url: `${APP_URL}/app/dominios?checkout=cancelado`,
  });
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
    console.error("[stripe] domain checkout falhou:", res.status);
    throw httpError(502, "Stripe recusou a criação do checkout");
  }
  const url = typeof data.url === "string" ? data.url : null;
  const id = typeof data.id === "string" ? data.id : null;
  if (!url || !id) throw httpError(502, "Resposta inesperada do Stripe");
  return { id, url };
}

async function createMercosulDomainPix(
  internalRef: string,
  amountCents: number,
  host: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${MERCOSUL_API_URL}/pix/charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await requireSecret("MERCOSULPAY_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountCents / 100,
      currency: "BRL",
      description: `SeekerAi — Domínio ${host} (1 ano)`.slice(0, 200),
      reference_id: internalRef,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[mercosulpay] domain PIX falhou:", res.status);
    throw httpError(502, "MercosulPay recusou a criação do PIX");
  }
  return isRecord(data.data) ? data.data : data;
}

async function createMercosulPackPix(
  internalRef: string,
  pack: { credits: number; amountCents: number; intlCents: number },
): Promise<Record<string, unknown>> {
  const res = await fetch(`${MERCOSUL_API_URL}/pix/charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await requireSecret("MERCOSULPAY_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: pack.amountCents / 100,
      currency: "BRL",
      description: `SeekerAi — +${pack.credits} créditos`,
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

// Cupom do desconto de primeira compra — "once" desconta só a primeira
// fatura; a renovação já sai pelo preço cheio da assinatura.
async function ensureStripeCoupon(pct: number): Promise<string> {
  const key = await requireSecret("STRIPE_SECRET_KEY");
  const id = `first-purchase-${pct}`;
  const headers = { Authorization: `Bearer ${key}` };
  const res = await fetch(`https://api.stripe.com/v1/coupons/${encodeURIComponent(id)}`, { headers });
  if (res.ok) {
    const c = (await res.json()) as Record<string, unknown>;
    if (c.percent_off === pct && c.duration === "once") return id;
    // Config divergente — recria com os parâmetros certos.
    await fetch(`https://api.stripe.com/v1/coupons/${encodeURIComponent(id)}`, {
      method: "DELETE", headers,
    }).catch(() => {});
  }
  const create = await fetch("https://api.stripe.com/v1/coupons", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id,
      name: `Primeira compra -${pct}%`,
      percent_off: String(pct),
      duration: "once",
    }).toString(),
  });
  if (!create.ok) {
    console.error("[stripe] coupon falhou:", create.status);
    throw httpError(502, "Stripe recusou a criação do cupom");
  }
  return id;
}

async function createStripeSession(
  plan: { id: string; slug: string; nome: string; preco_centavos: number },
  userId: string,
  email: string | null,
  currency: BillingCurrency,
  amountCents: number,
  months: number,
  periodLabel: string,
  couponId?: string,
): Promise<{ id: string; url: string }> {
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][recurring][interval_count]": String(months),
    "line_items[0][price_data][product_data][name]": `SeekerAi — ${plan.nome} · ${periodLabel}`,
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "metadata[user_id]": userId,
    "metadata[plan_id]": plan.id,
    "metadata[plan_slug]": plan.slug,
    "metadata[currency]": currency,
    "metadata[period_months]": String(months),
    "subscription_data[metadata][user_id]": userId,
    "subscription_data[metadata][plan_id]": plan.id,
    "subscription_data[metadata][period_months]": String(months),
    success_url: `${APP_URL}/app?checkout=sucesso`,
    cancel_url: `${APP_URL}/app?checkout=cancelado`,
  });
  if (couponId) params.set("discounts[0][coupon]", couponId);
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
  amountCents: number,
  periodLabel: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${MERCOSUL_API_URL}/pix/charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await requireSecret("MERCOSULPAY_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountCents / 100,
      currency: "BRL",
      description: `SeekerAi — ${plan.nome} · ${periodLabel}`.slice(0, 200),
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

    // Cookies do Pixel enviados pelo cliente — o webhook repassa pro
    // evento Purchase (CAPI) casar a conversão com a sessão do anúncio.
    const fb = {
      fbp: typeof body.fbp === "string" ? body.fbp.slice(0, 200) : undefined,
      fbc: typeof body.fbc === "string" ? body.fbc.slice(0, 200) : undefined,
    };
    const fbMeta = (fb.fbp || fb.fbc) ? { fb } : {};

    // Pacote avulso de créditos — só para quem já tem assinatura ativa.
    if (body.creditPack === true) {
      const { data: sub } = await db.from("subscriptions")
        .select("id").eq("user_id", user.id)
        .in("status", ["active", "past_due"]).limit(1).maybeSingle();
      if (!sub) throw httpError(403, "Pacote de créditos disponível só para assinantes");
      const pack = CREDIT_PACKS[typeof body.packId === "string" ? body.packId : "pack50"]
        ?? CREDIT_PACKS.pack50;
      const internalRef = crypto.randomUUID();
      const { error } = await db.from("payments").insert({
        user_id: user.id,
        plan_id: null,
        provider: method === "card" ? "stripe" : "mercosulpay",
        provider_ref: internalRef,
        method,
        amount_cents: currency === "brl" ? pack.amountCents : pack.intlCents,
        status: "pending",
        metadata: { kind: "credit_pack", credits: pack.credits, currency, ...fbMeta },
      });
      if (error) throw httpError(500, `Falha ao registrar pagamento: ${error.message}`);

      if (method === "card") {
        // provider_ref do Stripe precisa ser o id da sessão — o webhook casa por ele.
        const session = await createStripePackSession(user.id, null, currency, pack);
        await db.from("payments")
          .update({ provider_ref: session.id })
          .eq("provider", "stripe").eq("provider_ref", internalRef);
        return json({ provider: "stripe", method, checkoutUrl: session.url });
      }
      try {
        const charge = await createMercosulPackPix(internalRef, pack);
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

    // Domínio próprio — anuidade única, ativação manual em até 48h.
    if (typeof body.domainHost === "string" && body.domainHost.trim()) {
      const siteSlug = typeof body.domainSiteSlug === "string" ? body.domainSiteSlug.trim() : "";
      const host = body.domainHost.trim().toLowerCase().replace(/^www\./, "");
      if (!siteSlug) throw httpError(400, "Informe o site");
      if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) {
        throw httpError(400, "Domínio inválido — use o formato exemplo.com.br");
      }
      const { data: site } = await db.from("sites")
        .select("slug,nome,publicado,lead_id,config").eq("slug", siteSlug).maybeSingle();
      if (!site || !site.publicado) throw httpError(404, "Site não encontrado");
      let owns = false;
      if (site.lead_id) {
        const { data: lead } = await db.from("leads")
          .select("user_id").eq("id", site.lead_id).maybeSingle();
        owns = lead?.user_id === user.id;
      }
      const cfg = isRecord(site.config) ? site.config : {};
      if (!owns && cfg.owner === user.id) owns = true;
      if (!owns) throw httpError(403, "Este site não é seu");

      const { data: live } = await db.from("domains")
        .select("id").eq("site_slug", siteSlug)
        .in("status", ["pending_setup", "active"]).limit(1);
      if (live && live.length > 0) {
        throw httpError(409, "Este site já tem um domínio em andamento");
      }

      const { data: priceRow } = await db.from("app_settings")
        .select("value").eq("key", "domain_price_cents").maybeSingle();
      const priceCents = Math.min(1_000_000, Math.max(500, Number(priceRow?.value ?? 6999) || 6999));

      // Pedidos não pagos do mesmo site são descartados junto com a cobrança.
      const { data: stale } = await db.from("domains")
        .select("id,payment_id").eq("site_slug", siteSlug).eq("status", "pending_payment");
      for (const d of stale ?? []) {
        if (d.payment_id) {
          await db.from("payments")
            .update({ status: "expired" }).eq("id", d.payment_id).eq("status", "pending");
        }
        await db.from("domains").update({ status: "removed" }).eq("id", d.id);
      }

      const { data: domain, error: domainError } = await db.from("domains").insert({
        user_id: user.id,
        site_slug: siteSlug,
        desired_host: host,
        status: "pending_payment",
        price_cents: priceCents,
      }).select("id").single();
      if (domainError || !domain) throw httpError(500, "Falha ao registrar o pedido de domínio");

      const internalRef = crypto.randomUUID();
      const { data: payment, error: payError } = await db.from("payments").insert({
        user_id: user.id,
        plan_id: null,
        provider: method === "card" ? "stripe" : "mercosulpay",
        provider_ref: internalRef,
        method,
        amount_cents: priceCents,
        status: "pending",
        metadata: { kind: "domain", domain_id: domain.id, currency: "brl", ...fbMeta },
      }).select("id").single();
      if (payError || !payment) {
        throw httpError(500, `Falha ao registrar pagamento: ${payError?.message ?? "erro"}`);
      }
      await db.from("domains").update({ payment_id: payment.id }).eq("id", domain.id);

      if (method === "card") {
        const session = await createStripeDomainSession(user.id, priceCents, host);
        await db.from("payments")
          .update({ provider_ref: session.id })
          .eq("id", payment.id);
        return json({ provider: "stripe", method, checkoutUrl: session.url, domainId: domain.id });
      }
      try {
        const charge = await createMercosulDomainPix(internalRef, priceCents, host);
        return json({
          provider: "mercosulpay", method, reference: internalRef, domainId: domain.id,
          qrCode: pickDeep(charge, ["qr_code", "qrCode", "emv", "pix_copy_paste"]),
          qrCodeImage: pickDeep(charge, ["qr_code_image", "qrCodeBase64"]),
          expiresAt: pickDeep(charge, ["expires_at", "expiration", "expiresAt"]),
        });
      } catch (err) {
        await db.from("payments").update({ status: "failed" }).eq("id", payment.id);
        await db.from("domains").update({ status: "removed" }).eq("id", domain.id);
        throw err;
      }
    }

    const period = PERIODS[typeof body.period === "string" ? body.period : ""]
      ? body.period!
      : "mensal";
    const periodDef = PERIODS[period];

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

    // Preço cobrado: BRL usa o preço do banco; USD/EUR usam a tabela
    // internacional. Desconto do período aplica sobre a mensalidade
    // equivalente; o ciclo cobra o total (equivalente × meses).
    const baseCents = currency === "brl"
      ? plan.preco_centavos
      : INTL_PRICES[plan.slug];
    if (!baseCents) {
      throw httpError(409, "Este plano não está disponível nesta região");
    }
    const monthlyEquiv = Math.round(baseCents * (100 - periodDef.discount * 100) / 100);
    const amountCents = monthlyEquiv * periodDef.months;

    // Desconto de primeira compra (admin > financeiro). Só vale para quem
    // nunca teve pagamento confirmado — no Stripe entra como cupom "once"
    // (a renovação cobra o valor cheio); no PIX a cobrança já nasce com
    // o preço final descontado.
    const { data: discRow } = await db.from("app_settings")
      .select("value").eq("key", "first_purchase_discount_pct").maybeSingle();
    const settingPct = Math.min(90, Math.max(0, Math.trunc(Number(discRow?.value ?? 0)) || 0));
    let discountPct = 0;
    if (settingPct > 0) {
      const { data: prevPaid } = await db.from("payments")
        .select("id").eq("user_id", user.id).eq("status", "paid").limit(1);
      if (!prevPaid || prevPaid.length === 0) discountPct = settingPct;
    }
    const chargedCents = discountPct > 0
      ? Math.max(100, Math.round(amountCents * (100 - discountPct) / 100))
      : amountCents;
    const discMeta = discountPct > 0
      ? { discount_pct: discountPct, full_amount_cents: amountCents }
      : {};

    // Checkouts de plano abandonados: se o usuário gerar um novo, os antigos
    // são cancelados para que um PIX/cartão pago depois não ative dois ciclos.
    await db.from("payments")
      .update({ status: "expired" })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .not("plan_id", "is", null);

    if (method === "card") {
      const couponId = discountPct > 0 ? await ensureStripeCoupon(discountPct) : undefined;
      const session = await createStripeSession(
        plan, user.id, null, currency, amountCents, periodDef.months, periodDef.label, couponId,
      );
      const { error } = await db.from("payments").insert({
        user_id: user.id,
        plan_id: plan.id,
        provider: "stripe",
        provider_ref: session.id,
        method: "card",
        amount_cents: chargedCents,
        status: "pending",
        metadata: { currency, period, months: periodDef.months, ...discMeta, ...fbMeta },
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
      amount_cents: chargedCents,
      status: "pending",
      metadata: { period, months: periodDef.months, ...discMeta, ...fbMeta },
    });
    if (error) throw httpError(500, `Falha ao registrar pagamento: ${error.message}`);

    try {
      const charge = await createMercosulPix(plan, internalRef, chargedCents, periodDef.label);
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
