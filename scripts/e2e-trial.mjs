// Teste E2E do paywall em PRODUÇÃO.
// Novo usuário nasce SEM créditos: qualquer ação na edge devolve 402
// "Créditos insuficientes" e a UI mostra o upsell (modal tutorial).
// Uso: node scripts/e2e-trial.mjs
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const TS = Date.now();
const EMAIL = `devin-paywall-${TS}@seekerai.digital`;
const PASS = `Wall!${TS}x`;

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
    body: JSON.stringify(body), signal: AbortSignal.timeout(200_000),
  });
const saldo = async () =>
  (await (await rest(`credit_wallets?user_id=eq.${userId}&select=saldo`)).json())?.[0]?.saldo;

let userId = null;
let jwt = null;
try {
  /* 1. Conta nova nasce ZERADA — sem bônus de entrada */
  const created = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { nome: "E2E Paywall" } }),
  })).json();
  userId = created.id;
  if (!userId) throw new Error("sem usuário");
  ok("conta nova nasce com saldo 0", (await saldo()) === 0, `saldo ${await saldo()}`);

  const link = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  })).json();
  const verify = await (await fetch(`${SUPA}/auth/v1/verify`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
  })).json();
  jwt = verify.access_token;
  ok("login", Boolean(jwt));

  /* 2. Nada pinga de graça — nem welcome nem cota diária */
  const ledger = await (await rest(`credit_ledger?user_id=eq.${userId}&select=ref,delta`)).json();
  ok("sem nenhum crédito grátis no ledger", (ledger ?? []).length === 0, JSON.stringify(ledger));

  /* 3. claim existe mas diz que não renova nada */
  const claimR = await fetch(`${SUPA}/rest/v1/rpc/claim_daily_credits`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const claim = await claimR.json();
  ok("claim devolve ativo:false e saldo 0", claim.ativo === false && claim.saldo === 0, JSON.stringify(claim));

  /* 4. Busca na edge → 402 (paywall) */
  const search = await edge("places-search", {
    query: "barbearia em Osasco SP", serviceSlug: "sites",
    requestRef: `e2e-${TS}-s`, regionCode: "BR",
  }, jwt);
  const searchBody = await search.json().catch(() => ({}));
  ok("busca bloqueia sem plano (402)", search.status === 402 && /insuficiente/i.test(searchBody.erro ?? ""),
    `status ${search.status} · ${searchBody.erro}`);

  /* 5. Ação de IA também → 402 */
  const ai = await edge("ai-generate", {
    action: "sales_reply", serviceSlug: "sites", businessRef: `e2e-${TS}`,
    requestRef: `e2e-${TS}-m`, lang: "pt",
    prompt: "mensagem de abordagem", context: {},
  }, jwt);
  const aiBody = await ai.json().catch(() => ({}));
  ok("geração de IA bloqueia sem plano (402)", ai.status === 402 && /insuficiente/i.test(aiBody.erro ?? ""),
    `status ${ai.status} · ${aiBody.erro}`);

  /* 6. Saldo continua 0 — nada foi cobrado nem creditado */
  ok("saldo segue 0 depois das tentativas", (await saldo()) === 0, `saldo ${await saldo()}`);
} catch (err) {
  ok("fluxo", false, String(err));
} finally {
  if (userId) {
    await rest(`lead_outputs?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
    await rest(`leads?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
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
