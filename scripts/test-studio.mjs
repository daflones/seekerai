// e2e do Estúdio: login via Admin API → ai-generate(generate_app) →
// grava studio_projects + publica site tipo=custom. Só teste — usa slug e2e-*.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^"|"$/g, "").trim()]),
);
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SB_SERVICE = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = "372aebc6-2f78-4dc0-a20c-1869ec7a4cef";
const SH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function login() {
  const u = await fetch(`${SB_URL}/auth/v1/admin/users/${USER_ID}`, { headers: SH }).then(r => r.json());
  const gl = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
    method: "POST", headers: SH,
    body: JSON.stringify({ type: "magiclink", email: u.email }),
  }).then(r => r.json());
  const d = await fetch(`${SB_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: gl.hashed_token }),
  }).then(r => r.json());
  if (!d?.access_token) throw new Error("login falhou");
  log("logado:", d.user?.email);
  return d.access_token;
}

const target = process.argv[2] === "mobile" ? "mobile" : "web";
const prompt = process.argv.slice(3).join(" ") ||
  "Quero gerar um site pra barbearia do lucas, clientes agendam horario online, escolhem serviço e barbeiro, veem horarios livres e recebem confirmação automatica.";

const tk = await login();
log(`gerando target=${target} — isso leva ~1 min…`);
const t0 = Date.now();
const res = await fetch(`${SB_URL}/functions/v1/ai-generate`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${tk}`, apikey: SB_ANON, "Content-Type": "application/json",
  },
  body: JSON.stringify({
    action: "generate_app", serviceSlug: "sites",
    businessRef: `studio:e2e-${Date.now()}`,
    requestRef: `studio-e2e-${Date.now()}`,
    lang: "pt", prompt,
    context: { target, refs: [] },
  }),
  signal: AbortSignal.timeout(300_000),
});
const data = await res.json().catch(() => ({}));
log(`edge ${res.status} em ${((Date.now() - t0) / 1000).toFixed(0)}s, modelo=${data.modelo}, creditos=${data.creditosCobrados}`);
if (!res.ok || !data.conteudo?.includes("<")) {
  console.log("ERRO:", JSON.stringify(data).slice(0, 400));
  process.exit(1);
}
const html = data.conteudo;
log(`html ok: ${html.length} chars, doctype=${/^<!doctype html/i.test(html.trim())}`);

// grava projeto + publica
const nome = prompt.replace(/\s+/g, " ").trim().slice(0, 60);
const proj = await fetch(`${SB_URL}/rest/v1/studio_projects`, {
  method: "POST", headers: { ...SH, Prefer: "return=representation" },
  body: JSON.stringify({
    user_id: USER_ID, nome, prompt, target, html,
    refs: [], status: "done", modelo: data.modelo,
  }),
}).then(r => r.json());
log("studio_project:", proj?.[0]?.id ?? JSON.stringify(proj).slice(0, 200));

const slug = `e2e-studio-${Date.now().toString(36)}`;
const site = await fetch(`${SB_URL}/rest/v1/sites`, {
  method: "POST", headers: { ...SH, Prefer: "return=representation" },
  body: JSON.stringify({
    slug, tipo: "custom", nome, lead_id: null, publicado: true,
    config: { tipo: "custom", nome, lang: "pt", owner: USER_ID, target, html, seo: { title: nome } },
  }),
}).then(r => r.json());
log(`publicado: /site/${slug}`, site?.[0] ? "OK" : JSON.stringify(site).slice(0, 200));
