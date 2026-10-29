// Teste E2E do pacote de boas-vindas em PRODUÇÃO.
// Novo usuário deve nascer com 13 créditos: 1 busca (4) + 1 site (5)
// + 1 mensagem (1) + 1 estratégia (3). Depois disso, tudo bloqueia com
// "Créditos insuficientes" (a UI mostra o upsell "Gostou? Assine!").
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
const EMAIL = `devin-trial-${TS}@seekerai.digital`;
const PASS = `Trial!${TS}x`;

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
const cleanup = [];
try {
  /* 1. Usuário novo nasce com 13 créditos */
  const created = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { nome: "E2E Trial" } }),
  })).json();
  userId = created.id;
  if (!userId) throw new Error("sem usuário");
  ok("conta nova nasce com 13 créditos", (await saldo()) === 13, `saldo ${await saldo()}`);

  const link = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  })).json();
  const verify = await (await fetch(`${SUPA}/auth/v1/verify`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
  })).json();
  const jwt = verify.access_token;
  ok("login", Boolean(jwt));

  /* 2. Busca grátis funciona (4 cr) */
  const search = await edge("places-search", {
    query: "barbearia em Osasco SP", serviceSlug: "sites",
    requestRef: `e2e-${TS}-s`, regionCode: "BR",
  }, jwt);
  ok("1 busca permitida no trial", search.ok, `status ${search.status} · saldo ${await saldo()} (esperado 9)`);

  /* 3. Lead pro lead-workspace */
  const leadIns = await rest("leads", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId, service_slug: "sites", place_id: `e2e-${TS}`,
      nome: "Barbearia Trial E2E", cidade: "Osasco", uf: "SP",
      endereco: "Centro, Osasco - SP", telefone: "11999990000",
      avaliacao: 4.6, categoria: "Barbearia", status: "novo", dados: {},
    }),
  });
  const lead = (await leadIns.json().catch(() => null))?.[0];
  if (lead?.id) cleanup.push(["leads", `id=eq.${lead.id}`]);

  const ctx = { nome: lead.nome, categoria: lead.categoria, cidade: lead.cidade, uf: lead.uf, telefone: lead.telefone };

  /* 4. Mensagem de abordagem (1 cr) */
  const msg = await edge("ai-generate", {
    action: "sales_reply", serviceSlug: "sites", businessRef: lead.id,
    requestRef: `e2e-${TS}-m`, lang: "pt",
    prompt: "Escreva a mensagem de abordagem pro estabelecimento", context: ctx,
  }, jwt);
  const msgBody = await msg.json().catch(() => ({}));
  ok("1 mensagem de abordagem", msg.ok && Boolean(msgBody.conteudo), `status ${msg.status} · saldo ${await saldo()} (esperado 8)`);

  /* 5. Estratégia (3 cr) */
  const strat = await edge("ai-generate", {
    action: "deep_strategy", serviceSlug: "sites", businessRef: lead.id,
    requestRef: `e2e-${TS}-e`, lang: "pt",
    prompt: "Monte a estratégia de venda pro estabelecimento", context: ctx,
  }, jwt);
  const stratBody = await strat.json().catch(() => ({}));
  ok("1 estratégia", strat.ok && Boolean(stratBody.conteudo), `status ${strat.status} · saldo ${await saldo()} (esperado 5)`);

  /* 6. Site (5 cr) — job no servidor; a reserva acontece já na chamada */
  const site = await edge("ai-generate", {
    action: "generate_site", serviceSlug: "sites", businessRef: lead.id,
    requestRef: `e2e-${TS}-w`, lang: "pt",
    prompt: "Crie o site de apresentação do estabelecimento", context: ctx,
  }, jwt);
  const siteBody = await site.json().catch(() => ({}));
  const siteSlug = siteBody.siteSlug ?? null;
  if (siteSlug) cleanup.push(["sites", `slug=eq.${siteSlug}`]);
  ok("1 criação de site", site.ok && Boolean(siteSlug), `status ${site.status} · saldo ${await saldo()} (esperado 0)`);

  /* 7. Acabou o trial → bloqueio com erro de créditos */
  const after = await edge("places-search", {
    query: "padaria em Osasco SP", serviceSlug: "sites",
    requestRef: `e2e-${TS}-s2`, regionCode: "BR",
  }, jwt);
  const afterBody = await after.json().catch(() => ({}));
  ok("trial zerado bloqueia novas ações",
    after.status === 402 && /insuficiente/i.test(afterBody.erro ?? ""),
    `status ${after.status} · ${afterBody.erro}`);
} catch (err) {
  ok("fluxo", false, String(err));
} finally {
  for (const [table, q] of cleanup) await rest(`${table}?${q}`, { method: "DELETE" }).catch(() => null);
  if (userId) {
    await rest(`lead_outputs?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
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
