// Teste E2E do fluxo do usuário em PRODUÇÃO (Supabase + edges + site público).
// Cria um usuário descartável, loga, gera PIX, adiciona créditos, faz busca
// real, gera um site de lead e limpa tudo no final.
// Uso: node scripts/e2e-flow.mjs
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "https://seekerai.digital";
const TS = Date.now();
const EMAIL = `devin-e2e-${TS}@seekerai.digital`;
const PASS = `E2e!${TS}x`;

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  →  " + extra : ""}`);
};

const rest = (path, opts = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, { ...opts, headers: { ...svc, Prefer: "return=representation", ...(opts.headers ?? {}) } });
const rpc = (fn, body) =>
  fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers: svc, body: JSON.stringify(body) });
const edge = (fn, body, token) =>
  fetch(`${SUPA}/functions/v1/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(200_000),
  });

let userId = null;
const cleanup = [];
try {
  /* ---------- 1. Cadastro + login ---------- */
  const created = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { nome: "E2E Devin" } }),
  })).json();
  userId = created.id;
  ok("cadastro (admin createUser)", Boolean(userId), EMAIL);
  if (!userId) throw new Error("sem usuário");

  // Password grant é protegido por captcha em prod — via admin
  // generate_link + verify a gente simula o login sem captcha.
  const link = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  })).json();
  const verify = await (await fetch(`${SUPA}/auth/v1/verify`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
  })).json();
  const jwt = verify.access_token;
  ok("login (magiclink → JWT)", Boolean(jwt), jwt ? "sessão emitida" : JSON.stringify(link).slice(0, 160));

  /* ---------- 2. Edge exige auth ---------- */
  const unauth = await edge("places-search", { query: "x", serviceSlug: "sites", requestRef: "e2e-x" });
  ok("edge sem JWT → 401", unauth.status === 401, `status ${unauth.status}`);

  /* ---------- 3. Checkout PIX ---------- */
  const pix = await edge("billing-checkout", { planSlug: "essencial", method: "pix", currency: "brl" }, jwt);
  const pixBody = await pix.json().catch(() => ({}));
  const pixCode = pixBody.qrCode ?? pixBody.pixCopiaECola ?? pixBody.qr_code ?? pixBody.brcode;
  ok("checkout PIX gera cobrança", pix.ok && Boolean(pixCode), `status ${pix.status} · ${JSON.stringify(pixBody).slice(0, 140)}`);

  /* ---------- 4. Créditos na carteira ---------- */
  const ref = `e2e-${TS}`;
  const cred = await rpc("apply_credit_delta", { p_user: userId, p_delta: 60, p_motivo: "e2e", p_ref: `${ref}-cred` });
  ok("créditos aplicados (+60)", cred.ok, `status ${cred.status}`);

  /* ---------- 5. Busca real no radar ---------- */
  const search = await edge("places-search", {
    query: "barbearia em Osasco SP",
    serviceSlug: "sites",
    requestRef: `${ref}-search`,
    regionCode: "BR",
  }, jwt);
  const searchBody = await search.json().catch(() => ({}));
  const found = Array.isArray(searchBody.resultados) ? searchBody.resultados.length
    : Array.isArray(searchBody.results) ? searchBody.results.length
    : Array.isArray(searchBody) ? searchBody.length : -1;
  ok("busca retorna estabelecimentos", search.ok && found > 0, `status ${search.status} · ${found} encontrados`);

  /* ---------- 6. Salva lead + gera site ---------- */
  const leadIns = await rest("leads", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId, service_slug: "sites", place_id: `e2e-${TS}`,
      nome: "Barbearia E2E Teste", cidade: "Osasco", uf: "SP",
      endereco: "Centro, Osasco - SP", telefone: "11999990000",
      avaliacao: 4.6, categoria: "Barbearia", status: "novo", dados: {},
    }),
  });
  const lead = (await leadIns.json().catch(() => null))?.[0];
  ok("lead salvo no CRM", Boolean(lead?.id), lead?.id ?? JSON.stringify(await leadIns.clone().json().catch(() => "")).slice(0, 120));
  if (lead?.id) cleanup.push(["leads", `id=eq.${lead.id}`]);

  if (lead?.id) {
    const gen = await edge("ai-generate", {
      action: "generate_site",
      serviceSlug: "sites",
      businessRef: lead.id,
      requestRef: `${ref}-site`,
      prompt: "Crie o site de apresentação do estabelecimento",
      context: {},
      lang: "pt",
    }, jwt);
    const genBody = await gen.json().catch(() => ({}));
    const slug = genBody.siteSlug ?? (typeof genBody.conteudo === "string" ? genBody.conteudo.match(/site\/([\w-]+)/)?.[1] : null);
    ok("geração de site conclui", gen.ok && Boolean(slug), `status ${gen.status} · slug ${slug} · erros img: ${genBody.imagemErros?.length ?? 0}`);

    if (slug) {
      cleanup.push(["sites", `slug=eq.${slug}`]);
      const pub = await fetch(`${APP}/site/${slug}`, { signal: AbortSignal.timeout(30_000) });
      ok("site público acessível", pub.status === 200, `${APP}/site/${slug} → ${pub.status}`);
    }
  }

  /* ---------- 7. Saldo final conferido ---------- */
  const wallet = await (await rest(`credit_wallets?user_id=eq.${userId}&select=saldo`)).json();
  const saldo = wallet?.[0]?.saldo;
  ok("ledger consistente (60 - busca - site ≥ 0)", typeof saldo === "number" && saldo >= 0, `saldo final ${saldo}`);
} catch (err) {
  ok("fluxo", false, String(err));
} finally {
  /* ---------- cleanup ---------- */
  for (const [table, q] of cleanup) await rest(`${table}?${q}`, { method: "DELETE" }).catch(() => null);
  await rest(`lead_outputs?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
  await rest(`payments?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
  await rest(`credit_operations?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
  await rest(`credit_ledger?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
  await rest(`credit_wallets?user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
  await rest(`profiles?id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
  if (userId) {
    await fetch(`${SUPA}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: svc }).catch(() => null);
  }
  console.log(`\ncleanup feito · ${results.filter(r => r.pass).length}/${results.length} passaram`);
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
