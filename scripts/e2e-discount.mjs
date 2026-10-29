// Teste E2E do desconto de primeira compra em PRODUÇÃO.
// Cria usuário descartável e valida: setting no banco, PIX com valor
// descontado, sessão Stripe com cupom "once", e que quem já pagou NÃO
// recebe desconto. Limpa tudo no final.
// Uso: node scripts/e2e-discount.mjs
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE = env.STRIPE_SECRET_KEY;
const TS = Date.now();
const EMAIL = `devin-disc-${TS}@seekerai.digital`;
const PASS = `Disc!${TS}x`;
const PCT = 20;

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  →  " + extra : ""}`);
};
const rest = (path, opts = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, { ...opts, headers: { ...svc, Prefer: "return=representation", ...(opts.headers ?? {}) } });
const edge = (fn, body, token) =>
  fetch(`${SUPA}/functions/v1/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  });
const stripeGet = (path) =>
  fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${STRIPE}` } });

let userId = null;
try {
  /* 1. Setting existe e está ativo */
  const setting = (await (await rest(`app_settings?key=eq.first_purchase_discount_pct&select=value`)).json())?.[0];
  const pct = Number(setting?.value ?? 0);
  ok("setting first_purchase_discount_pct no banco", pct === PCT, `valor ${pct}`);

  const plan = (await (await rest(`plans?slug=eq.essencial&select=preco_centavos`)).json())?.[0];
  const FULL = Number(plan?.preco_centavos);
  const EXPECTED = Math.round(FULL * (100 - PCT) / 100);
  if (!FULL) throw new Error("plano essencial sem preço");

  /* 2. Usuário novo + login */
  const created = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { nome: "E2E Disc" } }),
  })).json();
  userId = created.id;
  if (!userId) throw new Error("sem usuário");
  const link = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  })).json();
  const verify = await (await fetch(`${SUPA}/auth/v1/verify`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
  })).json();
  const jwt = verify.access_token;
  ok("usuário novo + login", Boolean(jwt), EMAIL);

  /* 3. PIX de plano → cobrança descontada */
  const pix = await edge("billing-checkout", { planSlug: "essencial", method: "pix", currency: "brl", period: "mensal" }, jwt);
  const pixBody = await pix.json().catch(() => ({}));
  const pixPay = (await (await rest(`payments?user_id=eq.${userId}&order=created_at.desc&limit=1`)).json())?.[0];
  ok("PIX cobra valor com desconto",
    pix.ok && pixPay?.amount_cents === EXPECTED,
    `cobrado R$${(pixPay?.amount_cents ?? 0) / 100} (esperado R$${EXPECTED / 100}) · qr ${pixBody.qrCode ? "ok" : "faltou"}`);
  ok("payment guarda discount_pct no metadata",
    pixPay?.metadata?.discount_pct === PCT,
    JSON.stringify({ discount_pct: pixPay?.metadata?.discount_pct, full: pixPay?.metadata?.full_amount_cents }));

  /* 4. Cartão → sessão Stripe com cupom "once" */
  const card = await edge("billing-checkout", { planSlug: "essencial", method: "card", currency: "brl", period: "mensal" }, jwt);
  const cardBody = await card.json().catch(() => ({}));
  const sessionId = cardBody.checkoutUrl ? cardBody.checkoutUrl.match(/cs_test_[\w]+|cs_live_[\w]+/)?.[0] : null;
  ok("checkout Stripe criado", card.ok && Boolean(sessionId), sessionId ?? JSON.stringify(cardBody).slice(0, 140));

  if (sessionId) {
    const sess = await (await stripeGet(`checkout/sessions/${sessionId}`)).json();
    const disc = sess.total_details?.amount_discount ?? null;
    ok("sessão Stripe tem desconto aplicado",
      typeof disc === "number" && disc === FULL - EXPECTED,
      `amount_discount ${disc} · total ${sess.amount_total}`);
    const cardPay = (await (await rest(`payments?provider_ref=eq.${sessionId}&select=amount_cents,metadata`)).json())?.[0];
    ok("payment do cartão registra valor final",
      cardPay?.amount_cents === EXPECTED,
      `R$${(cardPay?.amount_cents ?? 0) / 100}`);
  }

  const coupon = await (await stripeGet(`coupons/first-purchase-${PCT}`)).json();
  ok("cupom first-purchase-20 existe (once)",
    coupon.percent_off === PCT && coupon.duration === "once",
    `${coupon.percent_off}% · ${coupon.duration}`);

  /* 5. Quem já pagou NÃO recebe desconto */
  await rest("payments", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId, plan_id: null, provider: "mercosulpay",
      provider_ref: `e2e-paid-${TS}`, method: "pix",
      amount_cents: 100, status: "paid", metadata: { kind: "e2e" },
    }),
  });
  const pix2 = await edge("billing-checkout", { planSlug: "essencial", method: "pix", currency: "brl", period: "mensal" }, jwt);
  const pix2Pay = (await (await rest(`payments?user_id=eq.${userId}&status=eq.pending&order=created_at.desc&limit=1`)).json())?.[0];
  ok("segunda compra cobra preço cheio",
    pix2.ok && pix2Pay?.amount_cents === FULL,
    `cobrado R$${(pix2Pay?.amount_cents ?? 0) / 100} (esperado R$${FULL / 100})`);
  ok("segunda compra sem discount_pct",
    !pix2Pay?.metadata?.discount_pct,
    `metadata ${JSON.stringify(pix2Pay?.metadata ?? {})}`);
} catch (err) {
  ok("fluxo", false, String(err));
} finally {
  if (userId) {
    await rest(`payments?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
    await rest(`credit_operations?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
    await rest(`credit_ledger?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
    await rest(`credit_wallets?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
    await rest(`profiles?id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
    await fetch(`${SUPA}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: svc }).catch(() => null);
  }
  console.log(`\ncleanup feito · ${results.filter(r => r.pass).length}/${results.length} passaram`);
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
