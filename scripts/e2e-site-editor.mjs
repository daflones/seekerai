// Teste E2E do editor visual de sites (API /api/sites/[slug]/edit).
// Roda contra um servidor local (`npm run dev`) com o banco de PRODUÇÃO.
// Cria usuários descartáveis, um site custom e um site legado (lead_outputs),
// autentica via /auth/confirm (recovery link → cookie de sessão) e exercita
// GET/POST/DELETE + o gate de ownership. Limpa tudo no final.
// Uso: node scripts/e2e-site-editor.mjs   (dev server em :3000 rodando)
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.E2E_APP ?? "http://localhost:3000";
const TS = Date.now();
const SLUG = `e2e-editor-${TS}`;
const SLUG2 = `e2e-legacy-${TS}`;

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  →  " + extra : ""}`);
};
const rest = (path, opts = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, { ...opts, headers: { ...svc, Prefer: "return=representation", ...(opts.headers ?? {}) } });

const HTML_BEFORE = `<!doctype html><html><head><meta charset="utf-8"><style>h1{color:#123456}</style></head><body><h1>ANTES-EDICAO-${TS}</h1><p>texto original</p></body></html>`;
const HTML_AFTER = `<!doctype html><html><head><meta charset="utf-8"><style>h1{color:#654321}</style></head><body><h1>DEPOIS-EDICAO-${TS}</h1><p>texto editado</p></body></html>`;
const HTML_LEGACY = `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>LEGADO-${TS}</h1></body></html>`;

// Sessão real no app local: recovery link → /auth/confirm seta os cookies.
async function sessionCookie(email) {
  const link = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ type: "recovery", email }),
  })).json();
  const res = await fetch(
    `${APP}/auth/confirm?token_hash=${encodeURIComponent(link.hashed_token)}&type=recovery`,
    { redirect: "manual" },
  );
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  return cookie.includes("sb-") ? cookie : null;
}

const api = (path, cookie, opts = {}) =>
  fetch(`${APP}${path}`, {
    ...opts,
    headers: {
      Origin: APP, Cookie: cookie ?? "",
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });

const users = [];
const cleanup = [];
try {
  /* ---------- 1. Dois usuários ---------- */
  for (const tag of ["dono", "intruso"]) {
    const email = `devin-edit-${tag}-${TS}@seekerai.digital`;
    const created = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
      method: "POST", headers: svc,
      body: JSON.stringify({ email, password: `E2e!${TS}`, email_confirm: true, user_metadata: { nome: `E2E ${tag}` } }),
    })).json();
    users.push({ id: created.id, email });
  }
  const [dono, intruso] = users;
  ok("usuários criados", Boolean(dono?.id && intruso?.id));

  /* ---------- 2. Site custom do dono ---------- */
  await rest("sites", {
    method: "POST",
    body: JSON.stringify({
      slug: SLUG, tipo: "custom", nome: "Site Editor E2E",
      config: { tipo: "custom", nome: "Site Editor E2E", lang: "pt", owner: dono.id, html: HTML_BEFORE },
      publicado: true, sem_expiracao: true,
    }),
  });
  cleanup.push(["sites", `slug=eq.${SLUG}`]);

  /* ---------- 3. Site legado (lead_outputs) ---------- */
  const lead = (await (await rest("leads", {
    method: "POST",
    body: JSON.stringify({
      user_id: dono.id, service_slug: "sites", place_id: `e2e-legacy-${TS}`,
      nome: "Legado E2E", cidade: "Osasco", uf: "SP", categoria: "Teste",
      status: "novo", dados: { siteSlug: SLUG2 },
    }),
  })).json())?.[0];
  if (lead?.id) {
    cleanup.push(["leads", `id=eq.${lead.id}`]);
    await rest("lead_outputs", {
      method: "POST",
      body: JSON.stringify({ lead_id: lead.id, user_id: dono.id, tipo: "generate_site", conteudo: HTML_LEGACY }),
    });
  }
  ok("site legado criado", Boolean(lead?.id));

  /* ---------- 4. Sessões ---------- */
  const cookieDono = await sessionCookie(dono.email);
  const cookieIntruso = await sessionCookie(intruso.email);
  ok("sessão do dono via /auth/confirm", Boolean(cookieDono));
  ok("sessão do intruso", Boolean(cookieIntruso));

  /* ---------- 5. GET — dono carrega o doc ---------- */
  const get1 = await api(`/api/sites/${SLUG}/edit`, cookieDono);
  const get1Body = await get1.json().catch(() => ({}));
  ok("GET dono → 200 + doc", get1.ok && get1Body.doc?.includes(`ANTES-EDICAO-${TS}`),
    `status ${get1.status} · edited ${get1Body.edited} · canRestore ${get1Body.canRestore}`);

  /* ---------- 6. GET sem sessão → 401 / outro usuário → 404 ---------- */
  const noAuth = await api(`/api/sites/${SLUG}/edit`, null);
  ok("GET sem sessão → 401", noAuth.status === 401, `status ${noAuth.status}`);
  const invade = await api(`/api/sites/${SLUG}/edit`, cookieIntruso);
  ok("GET intruso → 404", invade.status === 404, `status ${invade.status}`);

  /* ---------- 7. POST salva edição ---------- */
  const post = await api(`/api/sites/${SLUG}/edit`, cookieDono, {
    method: "POST", body: JSON.stringify({ doc: HTML_AFTER }),
  });
  const postBody = await post.json().catch(() => ({}));
  ok("POST salva doc editado", post.ok && postBody.canRestore === true, `status ${post.status}`);

  /* ---------- 8. POST do intruso não altera ---------- */
  const postInvasor = await api(`/api/sites/${SLUG}/edit`, cookieIntruso, {
    method: "POST", body: JSON.stringify({ doc: HTML_AFTER }),
  });
  ok("POST intruso → 404", postInvasor.status === 404, `status ${postInvasor.status}`);

  /* ---------- 9. /site público serve o editado ---------- */
  await new Promise((r) => setTimeout(r, 400));
  const pub = await fetch(`${APP}/site/${SLUG}`);
  const pubHtml = await pub.text();
  ok("/site serve a versão editada", pub.ok && pubHtml.includes(`DEPOIS-EDICAO-${TS}`), `status ${pub.status}`);

  /* ---------- 10. DELETE restaura o original ---------- */
  const del = await api(`/api/sites/${SLUG}/edit`, cookieDono, { method: "DELETE" });
  ok("DELETE restaura", del.ok, `status ${del.status}`);
  const pub2 = await fetch(`${APP}/site/${SLUG}`);
  const pub2Html = await pub2.text();
  ok("/site volta ao original", pub2Html.includes(`ANTES-EDICAO-${TS}`), `status ${pub2.status}`);

  /* ---------- 11. Legado: GET lê lead_outputs, POST promove pra sites ---------- */
  const getLeg = await api(`/api/sites/${SLUG2}/edit`, cookieDono);
  const getLegBody = await getLeg.json().catch(() => ({}));
  ok("GET legado → doc de lead_outputs", getLeg.ok && getLegBody.doc?.includes(`LEGADO-${TS}`), `status ${getLeg.status}`);
  const postLeg = await api(`/api/sites/${SLUG2}/edit`, cookieDono, {
    method: "POST", body: JSON.stringify({ doc: HTML_AFTER }),
  });
  ok("POST legado promove pra sites", postLeg.ok, `status ${postLeg.status}`);
  cleanup.push(["sites", `slug=eq.${SLUG2}`]);
  const pubLeg = await fetch(`${APP}/site/${SLUG2}`);
  const pubLegHtml = await pubLeg.text();
  ok("/site legado serve editado", pubLegHtml.includes(`DEPOIS-EDICAO-${TS}`), `status ${pubLeg.status}`);
} catch (err) {
  ok("fluxo", false, String(err));
} finally {
  for (const [table, q] of cleanup) await rest(`${table}?${q}`, { method: "DELETE" }).catch(() => null);
  for (const u of users) {
    if (!u?.id) continue;
    await rest(`lead_outputs?user_id=eq.${u.id}`, { method: "DELETE" }).catch(() => null);
    await rest(`profiles?id=eq.${u.id}`, { method: "DELETE" }).catch(() => null);
    await fetch(`${SUPA}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: svc }).catch(() => null);
  }
  console.log(`\ncleanup feito · ${results.filter((r) => r.pass).length}/${results.length} passaram`);
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
