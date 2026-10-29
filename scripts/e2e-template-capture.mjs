// Prova o caminho de captura de site de TEMPLATE (barbearia/beleza):
// clona a config de um site real em produção, abre no editor, edita e
// confirma que /site serve a versão convertida pra custom.
// Uso: node scripts/e2e-template-capture.mjs  (dev server em :3000)
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.E2E_APP ?? "http://127.0.0.1:3000";
const SRC_SLUG = process.env.SRC_SLUG ?? "xb-barbearia";
const TS = Date.now();
const SLUG = `e2e-tmpl-${TS}`;
const EMAIL = `e2e-tmpl-${TS}@seekerai.digital`;

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const rest = (p, o = {}) => fetch(`${SUPA}/rest/v1/${p}`, { ...o, headers: { ...svc, Prefer: "return=representation", ...(o.headers ?? {}) } });
const results = [];
const ok = (n, p, x = "") => { results.push({ n, p }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${x ? "  →  " + x : ""}`); };

let userId = null;
try {
  const user = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ email: EMAIL, password: `E2e!${TS}`, email_confirm: true }),
  })).json();
  userId = user?.id;
  ok("usuário", Boolean(userId));

  const src = (await (await rest(`sites?slug=eq.${SRC_SLUG}&select=config`)).json())?.[0];
  ok("site fonte existe", Boolean(src?.config), SRC_SLUG);
  const cfg = { ...src.config, owner: userId };
  await rest("sites", {
    method: "POST",
    body: JSON.stringify({ slug: SLUG, tipo: "barbearia", nome: "TMPL E2E", lead_id: null, config: cfg, publicado: true, sem_expiracao: true }),
  });

  const link = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST", headers: svc, body: JSON.stringify({ type: "recovery", email: EMAIL }),
  })).json();
  const conf = await fetch(`${APP}/auth/confirm?token_hash=${encodeURIComponent(link.hashed_token)}&type=recovery`, { redirect: "manual" });
  const cookie = conf.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const H = { Cookie: cookie, Origin: APP, "Content-Type": "application/json" };
  ok("sessão", cookie.includes("sb-"));

  const g = await fetch(`${APP}/api/sites/${SLUG}/edit`, { headers: H });
  const gb = await g.json().catch(() => ({}));
  ok("GET captura template → doc", g.ok && (gb.doc?.length ?? 0) > 1000,
    `status ${g.status} · ${gb.doc?.length ?? 0} chars · canRestore ${gb.canRestore}`);
  ok("doc parece o site real", /<!doctype html|<html/i.test(gb.doc ?? ""),
    gb.doc?.slice(0, 60)?.replace(/\s+/g, " "));

  const marker = `EDITADO-TMPL-${TS}`;
  const doc = gb.doc.replace(/<h1[^>]*>[^<]*/, `<h1>${marker}`);
  const p = await fetch(`${APP}/api/sites/${SLUG}/edit`, { method: "POST", headers: H, body: JSON.stringify({ doc }) });
  ok("POST converte template → custom", p.ok, `status ${p.status}`);

  const row = (await (await rest(`sites?slug=eq.${SLUG}&select=tipo,config`)).json())?.[0];
  ok("tipo virou custom + orig guardado", row?.tipo === "custom" && row?.config?.orig?.tipo === "barbearia",
    `tipo ${row?.tipo} · orig ${row?.config?.orig?.tipo}`);

  await new Promise((r) => setTimeout(r, 300));
  const pub = await fetch(`${APP}/site/${SLUG}`);
  const pt = await pub.text();
  ok("/site serve a versão editada", pub.ok && pt.includes(marker), `status ${pub.status}`);

  const d = await fetch(`${APP}/api/sites/${SLUG}/edit`, { method: "DELETE", headers: H });
  const row2 = (await (await rest(`sites?slug=eq.${SLUG}&select=tipo`)).json())?.[0];
  ok("DELETE restaura template", d.ok && row2?.tipo === "barbearia", `tipo ${row2?.tipo}`);
} catch (e) {
  ok("fluxo", false, String(e));
} finally {
  await rest(`sites?slug=eq.${SLUG}`, { method: "DELETE" }).catch(() => null);
  if (userId) {
    await rest(`profiles?id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
    await fetch(`${SUPA}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: svc }).catch(() => null);
  }
  console.log(`\ncleanup feito · ${results.filter((r) => r.p).length}/${results.length} passaram`);
  process.exit(results.every((r) => r.p) ? 0 : 1);
}
