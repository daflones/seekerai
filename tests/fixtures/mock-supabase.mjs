import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const ts = require("typescript");
const previewSource = readFileSync(new URL("../../apps/web/src/lib/plans/preview.ts", import.meta.url), "utf8");
const previewJs = ts.transpileModule(previewSource, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { previewPlanCards } = await import(`data:text/javascript;base64,${Buffer.from(previewJs).toString("base64")}`);
const plans = previewPlanCards.map((plan) => ({
  id: randomUUID(), slug: plan.slug, nome: plan.name, preco_centavos: plan.priceCents,
  ordem: plan.order, destaque: plan.featured, landing_visible: true, card_content: plan.content, card_revision: 0,
}));

// Local protocol fixture only. Never imported by the application or production image.
const publicKey = "local-public-fixture-key";
const privateKey = "local-private-fixture-key";
const accounts = new Map();
const sessions = new Map();
const usedCaptchas = new Set();
for (const [email, role] of [["user@example.test", "user"], ["admin@example.test", "admin"]]) {
  const id = randomUUID();
  accounts.set(email, { id, email, role, name: role === "admin" ? "Admin de teste" : "Conta comum", consent: true, balance: 50 });
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}
function user(account) {
  return {
    id: account.id, email: account.email, aud: "authenticated", role: "authenticated",
    email_confirmed_at: "2026-10-21T00:00:00Z", confirmed_at: "2026-10-21T00:00:00Z",
    created_at: "2026-10-21T00:00:00Z", app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: account.name }, identities: [{ id: account.id, provider: "email", user_id: account.id }],
  };
}
function session(account) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: account.id, email: account.email, aud: "authenticated", role: "authenticated",
    exp: expiresAt, iat: Math.floor(Date.now() / 1000), session_id: randomUUID(),
  })}`;
  const token = `${unsigned}.${createHmac("sha256", "local-signing-fixture-secret").update(unsigned).digest("base64url")}`;
  sessions.set(token, account);
  return { access_token: token, refresh_token: randomUUID(), token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user: user(account) };
}
function validCaptcha(body) {
  const token = body.gotrue_meta_security?.captcha_token;
  if (typeof token !== "string" || !token.startsWith("local-captcha-") || usedCaptchas.has(token)) return false;
  usedCaptchas.add(token);
  return true;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:54329");
    if (url.pathname === "/health") return json(response, 200, { status: "ok" });
    const key = request.headers.apikey;
    if (key !== publicKey && key !== privateKey) return json(response, 401, { message: "Invalid fixture API key" });
    const token = request.headers.authorization?.replace(/^Bearer /, "");
    const account = sessions.get(token);
    const privileged = key === privateKey;
    let body = {};
    if (request.method === "POST" || request.method === "PUT") {
      let text = "";
      for await (const part of request) text += part;
      body = text ? JSON.parse(text) : {};
    }
    if (url.pathname === "/auth/v1/token") {
      if (!validCaptcha(body)) return json(response, 400, { code: "captcha_failed", msg: "Captcha invalid" });
      const found = accounts.get(body.email);
      if (!found || body.password !== "local-test-password-123") return json(response, 400, { code: "invalid_credentials", msg: "Invalid credentials" });
      return json(response, 200, session(found));
    }
    if (url.pathname === "/auth/v1/signup") {
      if (!validCaptcha(body)) return json(response, 400, { code: "captcha_failed", msg: "Captcha invalid" });
      const found = accounts.get(body.email);
      if (found) return json(response, 200, { ...user(found), identities: [] });
      const created = { id: randomUUID(), email: body.email, role: "user", name: body.data?.full_name || "", consent: false, balance: 50 };
      accounts.set(body.email, created);
      return json(response, 200, user(created));
    }
    if (url.pathname === "/auth/v1/recover") {
      return validCaptcha(body) ? json(response, 200, {}) : json(response, 400, { code: "captcha_failed", msg: "Captcha invalid" });
    }
    if (url.pathname === "/auth/v1/user") {
      return account ? json(response, 200, user(account)) : json(response, 401, { code: "bad_jwt", msg: "Session invalid" });
    }
    if (url.pathname === "/auth/v1/logout") {
      sessions.delete(token);
      return json(response, 204);
    }
    if (url.pathname === "/rest/v1/rpc/check_auth_rate_limit") {
      return privileged ? json(response, 200, [{ allowed: true, retry_after: 0 }]) : json(response, 403, {});
    }
    if (url.pathname === "/rest/v1/rpc/record_registration_consent") {
      if (!privileged) return json(response, 403, {});
      const found = [...accounts.values()].find((item) => item.id === body.p_user);
      if (found) { found.consent = true; found.name = body.p_name; }
      return json(response, 204);
    }
    if (url.pathname === "/rest/v1/public_plan_cards") return json(response, 200, plans.filter((plan) => plan.landing_visible).sort((a, b) => a.ordem - b.ordem));
    if (!account) return json(response, 401, { message: "Session required" });
    if (url.pathname === "/rest/v1/plans") return account.role === "admin" ? json(response, 200, plans) : json(response, 403, {});
    if (url.pathname === "/rest/v1/rpc/configure_plan_card") {
      if (account.role !== "admin") return json(response, 403, { code: "42501", message: "Admin access required" });
      const plan = plans.find((item) => item.id === body.p_plan);
      if (!plan) return json(response, 404, {});
      if (plan.card_revision !== body.p_revision) return json(response, 409, { code: "40001", message: "Revision conflict" });
      Object.assign(plan, { nome: body.p_name, preco_centavos: body.p_price, ordem: body.p_order,
        destaque: body.p_featured, landing_visible: body.p_visible, card_content: body.p_content, card_revision: plan.card_revision + 1 });
      return json(response, 204);
    }
    if (url.pathname === "/rest/v1/profiles") {
      const rows = [...accounts.values()].filter((item) => account.role === "admin" || item.id === account.id);
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const filtered = rows.filter((item) => !id || id === item.id).map((item) => ({
        id: item.id, nome: item.name, role: item.role, consentimento_em: item.consent ? "2026-10-21" : null,
        terms_version: item.consent ? "2026-10-21" : null, onboarding_concluido: item.consent,
      }));
      return json(response, 200, id ? filtered[0] : filtered, { "Content-Range": `0-${Math.max(0, filtered.length - 1)}/${filtered.length}` });
    }
    if (url.pathname === "/rest/v1/credit_wallets") return json(response, 200, { saldo: account.balance });
    if (url.pathname === "/rest/v1/credit_settings") return json(response, 200, { welcome_credits: 50 });
    if (url.pathname === "/rest/v1/credit_action_rules") return json(response, 200, [
      { action: "search", cost: 4, enabled: true }, { action: "generate_image", cost: 2, enabled: true },
      { action: "generate_site", cost: 5, enabled: true }, { action: "deep_strategy", cost: null, enabled: false },
    ]);
    return json(response, 404, { message: "Unknown fixture endpoint" });
  } catch { return json(response, 500, { message: "Local fixture error" }); }
});
server.listen(54329, "127.0.0.1", () => console.log("Local Supabase protocol fixture ready."));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
