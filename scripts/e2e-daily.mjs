// Teste E2E da cota diária em PRODUÇÃO.
// Cobre: janela de 7 dias, top-up só da diferença até 13, idempotência
// no mesmo dia, expiração (para de cair) e bloqueio real na edge.
// Uso: node scripts/e2e-daily.mjs
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
const EMAIL = `devin-daily-${TS}@seekerai.digital`;
const PASS = `Daily!${TS}x`;

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  →  " + extra : ""}`);
};
const rest = (path, opts = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, { ...opts, headers: { ...svc, Prefer: "return=representation", ...(opts.headers ?? {}) } });
const rpc = async (name, body) => {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${name}`, { method: "POST", headers: svc, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${name} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
};
const edge = (fn, body, token) =>
  fetch(`${SUPA}/functions/v1/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(200_000),
  });
const saldo = async () =>
  (await (await rest(`credit_wallets?user_id=eq.${userId}&select=saldo`)).json())?.[0]?.saldo;
const todayRef = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `daily-pack:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let userId = null;
let jwt = null;
const claim = async () => {
  const r = await fetch(`${SUPA}/rest/v1/rpc/claim_daily_credits`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: "{}",
  });
  return r.json();
};

try {
  /* 1. Conta nova → 13 créditos, janela de 7 dias aberta */
  const created = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { nome: "E2E Daily" } }),
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
  jwt = verify.access_token;
  ok("conta nova + login", Boolean(jwt && userId));

  const c1 = await claim();
  ok("dia 1: saldo 13, janela aberta", c1.saldo === 13 && c1.ativo === true,
    `saldo ${c1.saldo} · ativo ${c1.ativo} · até ${String(c1.ate).slice(0, 10)}`);

  /* 2. Queima os 13 → claim no MESMO dia faz a primeira renovação */
  await rpc("apply_credit_delta", { p_user: userId, p_delta: -13, p_motivo: "teste", p_ref: `e2e-burn:${userId}` });
  const c2 = await claim();
  ok("zerou → renova até 13 no mesmo dia", c2.saldo === 13 && c2.ativo === true,
    `saldo ${c2.saldo}`);

  /* 3. Claim de novo hoje → não soma (ref do dia já usada) */
  const c3 = await claim();
  ok("segundo claim no dia não acumula", c3.saldo === 13, `saldo ${c3.saldo} (não vira 26)`);

  /* 4. Gasta 6 → simula "amanhã" movendo a ref de hoje pra ontem → +6 só */
  await rpc("apply_credit_delta", { p_user: userId, p_delta: -6, p_motivo: "teste", p_ref: `e2e-burn6:${userId}` });
  const yRef = todayRef().replace(/daily-pack:(.+)/, (_, d) => {
    const dt = new Date(`${d}T12:00:00`); dt.setDate(dt.getDate() - 1);
    return `daily-pack:${dt.toISOString().slice(0, 10)}`;
  });
  await rest(`credit_ledger?user_id=eq.${userId}&ref=eq.${todayRef()}`, {
    method: "PATCH", body: JSON.stringify({ ref: yRef }),
  });
  const c4 = await claim();
  ok("dia 2: completa só a diferença (+6)", c4.saldo === 13,
    `saldo ${c4.saldo} (7 + 6, não 13+7)`);

  /* 5. Busca real na edge gasta 4 → saldo 9 */
  const search = await edge("places-search", {
    query: "barbearia em Osasco SP", serviceSlug: "sites",
    requestRef: `e2e-${TS}-s`, regionCode: "BR",
  }, jwt);
  const s5 = await saldo();
  ok("ação real cobra normalmente", search.ok && s5 === 9, `status ${search.status} · saldo ${s5}`);

  /* 6. Expira a janela: backdata o welcome pra 8 dias atrás */
  await rest(`credit_ledger?user_id=eq.${userId}&ref=eq.welcome:v1`, {
    method: "PATCH",
    body: JSON.stringify({ created_at: new Date(Date.now() - 8 * 864e5).toISOString() }),
  });
  const c6 = await claim();
  ok("dia 8: janela fechada — nada mais cai", c6.ativo === false && c6.saldo === 9,
    `saldo ${c6.saldo} · ativo ${c6.ativo}`);

  /* 7. Expirado: claim não cria novo daily-pack nem soma */
  const ledgerBefore = (await (await rest(
    `credit_ledger?user_id=eq.${userId}&ref=like.daily-pack:*&select=ref`)).json()).length;
  await claim();
  const ledgerAfter = (await (await rest(
    `credit_ledger?user_id=eq.${userId}&ref=like.daily-pack:*&select=ref`)).json()).length;
  ok("expirado não gera nova entrada de renovação", ledgerAfter === ledgerBefore,
    `${ledgerBefore} → ${ledgerAfter} entradas`);

  /* 8. Expirado: ação na edge também NÃO renova → erro real de créditos */
  await rpc("apply_credit_delta", { p_user: userId, p_delta: -9, p_motivo: "teste", p_ref: `e2e-burn9:${userId}` });
  const blocked = await edge("places-search", {
    query: "padaria em Osasco SP", serviceSlug: "sites",
    requestRef: `e2e-${TS}-s2`, regionCode: "BR",
  }, jwt);
  const blockedBody = await blocked.json().catch(() => ({}));
  ok("expirado e zerado → edge bloqueia (402 créditos)",
    blocked.status === 402 && /insuficiente/i.test(blockedBody.erro ?? ""),
    `status ${blocked.status} · saldo ${await saldo()} (fica 0)`);

  /* 9. Assinante não recebe cota mesmo dentro da janela */
  const sub = (await (await rest(`subscriptions?status=eq.active&select=user_id&limit=1`)).json())?.[0];
  if (sub) {
    const w0 = (await (await rest(`credit_wallets?user_id=eq.${sub.user_id}&select=saldo`)).json())?.[0]?.saldo;
    await rpc("daily_credit_topup", { p_user: sub.user_id });
    const w1 = (await (await rest(`credit_wallets?user_id=eq.${sub.user_id}&select=saldo`)).json())?.[0]?.saldo;
    ok("assinante ativo não recebe cota diária", w1 === w0, `${w0} → ${w1}`);
  }
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
