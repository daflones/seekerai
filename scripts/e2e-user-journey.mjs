// Jornada completa de um usuário real, de ponta a ponta:
// landing → demo (busca real limitada) → cadastro → app → busca sem
// plano (paywall) → plano ESSENCIAL → busca real → salvar lead →
// gerar mensagem com IA → verificar bloqueios Pro/King → upgrade PRO.
// Roda contra o dev server local com o banco de produção. Limpa tudo.
// Uso: node scripts/e2e-user-journey.mjs   (dev server em :3000)
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

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  →  " + extra : ""}`);
};
const rest = (path, opts = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, { ...opts, headers: { ...svc, Prefer: "return=representation", ...(opts.headers ?? {}) } });
const rpc = (fn, body) => fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers: svc, body: JSON.stringify(body) });
const api = (path, cookie, opts = {}) =>
  fetch(`${APP}${path}`, {
    ...opts, redirect: "manual",
    headers: { Origin: APP, Cookie: cookie ?? "", "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
const page = (path, cookie) =>
  fetch(`${APP}${path}`, { redirect: "manual", headers: { Cookie: cookie ?? "" } });

async function sessionCookie(email) {
  const link = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
    method: "POST", headers: svc, body: JSON.stringify({ type: "recovery", email }),
  })).json();
  const res = await fetch(
    `${APP}/auth/confirm?token_hash=${encodeURIComponent(link.hashed_token)}&type=recovery`,
    { redirect: "manual" },
  );
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return cookie.includes("sb-") ? cookie : null;
}

const user = { id: null, email: `jornada-${TS}@seekerai.digital` };
const cleanup = [];
try {
  /* ============ 1. LANDING PÚBLICA ============ */
  const land = await fetch(APP);
  const landHtml = await land.text();
  ok("landing 200", land.ok, `status ${land.status}`);
  ok("landing tem a demo de busca", landHtml.includes("demo") || landHtml.includes("Demonstra"), "");
  ok("landing sem cards de preço (só CTA cadastro)",
    landHtml.includes("/cadastro") && !/plan-card|preco-mensal|pricing-grid/.test(landHtml));

  /* ============ 2. DEMO — busca real limitada ============ */
  const demoGet = await api("/api/demo/search", null);
  const demoSample = await demoGet.json().catch(() => ({}));
  ok("demo GET amostra", demoGet.ok && (demoSample.leads?.length ?? 0) > 0,
    `${demoSample.leads?.length ?? 0} leads · restante ${demoSample.restante}`);
  const lead0 = demoSample.leads?.[0] ?? {};
  ok("demo mascara whatsapp/instagram",
    /•/.test(lead0.whatsapp ?? "") && /•/.test(lead0.instagram ?? ""),
    `wa "${lead0.whatsapp}" ig "${lead0.instagram}"`);
  ok("demo traz exemplo de site", Boolean(demoSample.site?.slug), demoSample.site?.slug ?? "");
  const demoPost = await api("/api/demo/search", null, {
    method: "POST", body: JSON.stringify({ query: "barbearia em Osasco SP" }),
  });
  const demoRes = await demoPost.json().catch(() => ({}));
  ok("demo POST busca real", demoPost.ok && (demoRes.leads?.length ?? 0) > 0,
    `${demoRes.leads?.length ?? 0} resultados · restante ${demoRes.restante}`);

  /* ============ 3. CADASTRO ============ */
  const created = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ email: user.email, password: `E2e!${TS}`, email_confirm: true,
      user_metadata: { nome: "Jornada E2E" } }),
  })).json();
  user.id = created?.id;
  ok("usuário criado", Boolean(user.id));
  // Simula o consentimento do formulário de cadastro (RPC real do signup).
  const consent = await rpc("record_registration_consent", {
    p_user: user.id, p_name: "Jornada E2E", p_phone: "+5511999990000", p_marketing: false,
  });
  ok("cadastro/consetimento registrado", consent.ok, `status ${consent.status}`);
  const cookie = await sessionCookie(user.email);
  ok("sessão via /auth/confirm", Boolean(cookie));
  // Usuário novo cai no quiz de boas-vindas (redirect) — responde e segue.
  const dash1 = await page("/app", cookie);
  const vBoasVindas = dash1.status === 307 && (dash1.headers.get("location") ?? "").includes("boas-vindas");
  ok("novo usuário → quiz de boas-vindas", vBoasVindas, `status ${dash1.status} → ${dash1.headers.get("location")}`);
  const onb = await api("/api/onboarding", cookie, {
    method: "POST", body: JSON.stringify({ origem: "indicacao", dificuldade: "conseguir clientes" }),
  });
  ok("onboarding respondido", onb.ok, `status ${onb.status}`);
  const dash = await page("/app", cookie);
  ok("/app abre logado", dash.status === 200, `status ${dash.status}`);

  /* ============ 4. SEM PLANO → paywall na busca ============ */
  const noPlan = await api("/api/search-jobs", cookie, {
    method: "POST",
    body: JSON.stringify({ query: "barbearia em Osasco SP", serviceSlug: "sites",
      requestRef: `jrn-${TS}-noplan`, regionCode: "BR" }),
  });
  ok("busca sem plano → 403 paywall", noPlan.status === 403, `status ${noPlan.status}`);

  /* ============ 5. PLANO ESSENCIAL ============ */
  const planos = await (await rest("plans?slug=in.(essencial,pro)&select=id,slug,creditos_mensais")).json();
  const planId = (s) => planos?.find((p) => p.slug === s)?.id;
  const essencialCredits = planos?.find((p) => p.slug === "essencial")?.creditos_mensais ?? 10;
  const sub = (await (await rest("subscriptions", {
    method: "POST",
    body: JSON.stringify({ user_id: user.id, plan_id: planId("essencial"), provider: "e2e", status: "active" }),
  })).json())?.[0];
  ok("assinatura essencial ativa", Boolean(sub?.id));
  cleanup.push(["subscriptions", `user_id=eq.${user.id}`]);
  // Simula o grant mensal de créditos do plano.
  await rest("credit_wallets", {
    method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: user.id, saldo: essencialCredits }),
  });
  cleanup.push(["credit_wallets", `user_id=eq.${user.id}`]);

  /* ============ 6. BUSCA REAL COM ESSENCIAL ============ */
  const jobPost = await api("/api/search-jobs", cookie, {
    method: "POST",
    body: JSON.stringify({ query: "barbearia em Osasco SP", serviceSlug: "sites",
      requestRef: `jrn-${TS}-search`, regionCode: "BR" }),
  });
  const jobBody = await jobPost.json().catch(() => ({}));
  ok("busca essencial aceita (job criado)", jobPost.ok && jobBody.jobId, `status ${jobPost.status} · ${jobBody.jobId ?? "-"}`);
  cleanup.push(["search_jobs", `user_id=eq.${user.id}`]);

  // Poll até terminar (a edge chama Google/Serper de verdade).
  let job = null;
  for (let i = 0; i < 48; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const j = await api("/api/search-jobs?latest=1", cookie);
    job = (await j.json().catch(() => ({})))?.job ?? null;
    if (job && job.status !== "running" && job.status !== "queued") break;
  }
  const resultados = job?.result?.resultados ?? [];
  ok("busca real concluída com resultados", job?.status === "done" && resultados.length > 0,
    `status ${job?.status} · ${resultados.length} leads${job?.erro ? " · " + job.erro : ""}`);

  /* ============ 7. SALVAR LEADS ============ */
  const save = await api("/api/leads", cookie, {
    method: "POST",
    body: JSON.stringify({ serviceSlug: "sites", leads: resultados.slice(0, 2) }),
  });
  const saveBody = await save.json().catch(() => ({}));
  const leadId = saveBody.leads?.find(Boolean) ?? null;
  ok("leads salvos a partir da busca", save.ok && leadId, `salvos ${saveBody.salvos} · id ${leadId ?? "-"}`);
  cleanup.push(["leads", `user_id=eq.${user.id}`]);

  /* ============ 8. CRIAÇÃO — mensagem de venda com IA ============ */
  let genOk = false;
  if (leadId) {
    const leadRow = resultados.find((r) => r.id) ?? resultados[0];
    const gen = await api("/api/actions", cookie, {
      method: "POST",
      body: JSON.stringify({ funcao: "ai-generate", payload: {
        action: "sales_reply", serviceSlug: "sites", businessRef: leadId,
        requestRef: `jrn-${TS}-reply`, lang: "pt",
        prompt: `Escreva uma mensagem curta de prospecção (máx 3 parágrafos) para o negócio ${leadRow?.nome ?? "local"}.`,
        context: { nome: leadRow?.nome, categoria: leadRow?.categoria, cidade: leadRow?.cidade, uf: leadRow?.uf },
      } }),
    });
    const genBody = await gen.json().catch(() => ({}));
    genOk = gen.ok && typeof genBody.conteudo === "string" && genBody.conteudo.length > 40;
    ok("ia-generate sales_reply (essencial)", genOk,
      `status ${gen.status} · ${genBody.conteudo?.length ?? 0} chars${genBody.error ? " · " + genBody.error : ""}`);
    if (genOk) {
      const saveOut = await api(`/api/leads/${leadId}`, cookie, {
        method: "POST",
        body: JSON.stringify({ tipo: "sales_reply", conteudo: genBody.conteudo, modelo: genBody.modelo ?? null }),
      });
      const saveOutBody = saveOut.ok ? "" : (await saveOut.text()).slice(0, 200);
      ok("output salvo no lead", saveOut.ok, `status ${saveOut.status}${saveOutBody ? " · " + saveOutBody : ""}`);
      cleanup.push(["lead_outputs", `user_id=eq.${user.id}`]);
    }
  } else {
    ok("ia-generate sales_reply (essencial)", false, "sem lead salvo");
  }

  /* ============ 9. BLOQUEIOS ESSENCIAL (Pro/King only) ============ */
  const gen403 = await api("/api/studio/generate", cookie, {
    method: "POST",
    body: JSON.stringify({ prompt: "site de teste", target: "web", requestRef: `jrn-${TS}-app` }),
  });
  ok("studio generate essencial → 403", gen403.status === 403, `status ${gen403.status}`);
  const domCheck = await api("/api/domains/check?domain=exemplo-teste-jornada.com.br", cookie);
  ok("domains check essencial → 403", domCheck.status === 403, `status ${domCheck.status}`);
  const domPay = await api("/api/actions", cookie, {
    method: "POST",
    body: JSON.stringify({ funcao: "billing-checkout", payload: { domainHost: "exemplo-jrn.com.br", siteSlug: "x" } }),
  });
  ok("checkout domínio essencial → 403", domPay.status === 403, `status ${domPay.status}`);
  const edit403 = await api("/api/sites/qualquer/edit", cookie);
  ok("editor essencial → 403", edit403.status === 403, `status ${edit403.status}`);
  // Sem Accept-Language o locale cai em inglês — checa a marca da tela.
  const criar = await page("/app/criar", cookie);
  const criarHtml = await criar.text();
  ok("/app/criar mostra tela de upgrade", criar.status === 200 && criarHtml.includes("site-soon"),
    `status ${criar.status}`);
  const domPage = await page("/app/dominios", cookie);
  const domHtml = await domPage.text();
  ok("/app/dominios mostra tela de upgrade", domPage.status === 200 && domHtml.includes("site-soon"),
    `status ${domPage.status}`);

  /* ============ 10. UPGRADE PRO → desbloqueia ============ */
  await rest(`subscriptions?user_id=eq.${user.id}&status=eq.active`, {
    method: "PATCH", body: JSON.stringify({ plan_id: planId("pro") }),
  });
  const domCheckPro = await api("/api/domains/check?domain=exemplo-teste-jornada.com.br", cookie);
  ok("domains check pro → passa o gate", domCheckPro.status !== 403, `status ${domCheckPro.status}`);
  const editPro = await api("/api/sites/qualquer/edit", cookie);
  ok("editor pro → gate ok (404 sem site)", editPro.status === 404, `status ${editPro.status}`);
  const genPro = await api("/api/studio/generate", cookie, {
    method: "POST",
    body: JSON.stringify({ prompt: "x", target: "web", requestRef: `jrn-${TS}-app2` }),
  });
  // Passou o gate = não 403 (400 por prompt curto ou job criado).
  ok("studio generate pro → passa o gate", genPro.status !== 403, `status ${genPro.status}`);
  cleanup.push(["studio_projects", `user_id=eq.${user.id}`]);
  cleanup.push(["ai_jobs", `user_id=eq.${user.id}`]);
} catch (err) {
  ok("jornada", false, String(err?.stack ?? err));
} finally {
  for (const [table, q] of [...cleanup].reverse()) {
    await rest(`${table}?${q}`, { method: "DELETE" }).catch(() => null);
  }
  if (user.id) {
    await rest(`credit_operations?user_id=eq.${user.id}`, { method: "DELETE" }).catch(() => null);
    await rest(`credit_wallets?user_id=eq.${user.id}`, { method: "DELETE" }).catch(() => null);
    await rest(`search_jobs?user_id=eq.${user.id}`, { method: "DELETE" }).catch(() => null);
    await rest(`subscriptions?user_id=eq.${user.id}`, { method: "DELETE" }).catch(() => null);
    await rest(`studio_projects?user_id=eq.${user.id}`, { method: "DELETE" }).catch(() => null);
    await rest(`lead_outputs?user_id=eq.${user.id}`, { method: "DELETE" }).catch(() => null);
    await rest(`leads?user_id=eq.${user.id}`, { method: "DELETE" }).catch(() => null);
    await rest(`profiles?id=eq.${user.id}`, { method: "DELETE" }).catch(() => null);
    await fetch(`${SUPA}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: svc }).catch(() => null);
  }
  const n = results.filter((r) => r.pass).length;
  console.log(`\ncleanup feito · ${n}/${results.length} passaram`);
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
