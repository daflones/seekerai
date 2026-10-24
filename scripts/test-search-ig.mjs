// Teste e2e do places-search com enriquecimento Instagram.
// Uso: node scripts/test-search-ig.mjs (rodar de apps/web)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const env = {};
for (const l of readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../.env.local"), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const email = `teste-search-${Date.now()}@seekerai.dev`;
const password = `Teste!${randomUUID()}`;

const { data: created, error: cErr } = await db.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (cErr) { console.error("createUser:", cErr.message); process.exit(1); }
const userId = created.user.id;

const { error: credErr } = await db.rpc("apply_credit_delta", {
  p_user: userId, p_delta: 20, p_motivo: "teste", p_ref: `teste-${Date.now()}`,
});
if (credErr) { console.error("creditos:", credErr.message); process.exit(1); }

const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
const { data: sess, error: sErr } = await anon.auth.verifyOtp({
  type: "magiclink", token_hash: link.properties.hashed_token,
});
if (sErr || !sess.session) { console.error("verifyOtp:", sErr?.message); process.exit(1); }

const query = process.argv[2] || "padaria Cambuí Campinas";
console.log("→ buscando:", query);
const t0 = Date.now();
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/places-search`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${sess.session.access_token}`,
    apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query, serviceSlug: "sites", requestRef: randomUUID(), regionCode: "BR",
  }),
});
const data = await res.json().catch(() => ({}));
console.log(`edge: ${res.status} em ${Math.round((Date.now() - t0) / 1000)}s — ${data.resultados?.length ?? 0} resultados`);
if (!res.ok) { console.log(JSON.stringify(data)); process.exit(1); }

function printResults(resultados) {
  const comIg = resultados.filter((p) => p.instagram);
  const enriquecidos = resultados.filter((p) => p.ig);
  const salvos = resultados.filter((p) => p.leadId);
  console.log(`instagram: ${comIg.length} com @ | ${enriquecidos.length} enriquecidos | ${salvos.length} já-salvos`);
  for (const p of resultados.slice(0, 12)) {
    console.log(
      `  ${p.nome?.slice(0, 34).padEnd(34)} | ${p.instagram ?? "-"} | ` +
      (p.ig
        ? `${p.ig.seguidores ?? "?"} seg | ${p.ig.posts ?? "?"} posts | ~${p.ig.curtidas ?? "?"} curt | foto:${p.ig.foto ? "ok" : "x"}`
        : "sem ig-data") +
      (p.leadId ? ` | leadId:${p.leadId.slice(0, 8)} site:${p.sitePronto ? "ok" : "-"}` : ""),
    );
  }
}
printResults(data.resultados ?? []);

// Match de lead salvo: insere lead com place_id do 1º resultado e refaz a busca.
const first = (data.resultados ?? []).find((p) => p.id);
if (first) {
  const { data: lead } = await db.from("leads").insert({
    user_id: userId, service_slug: "sites", place_id: first.id,
    nome: first.nome, dados: { ig: { seguidores: 123, posts: 4, curtidas: 9, foto: null, bio: "bio teste" } },
  }).select("id").single();
  console.log("→ lead de teste criado, refazendo busca…");
  const res2 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/places-search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sess.session.access_token}`,
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query, serviceSlug: "sites", requestRef: randomUUID(), regionCode: "BR",
    }),
  });
  const data2 = await res2.json().catch(() => ({}));
  console.log(`edge2: ${res2.status}`);
  printResults(data2.resultados ?? []);
  await db.from("leads").delete().eq("id", lead.id);
}
console.log("TEST_USER=" + userId);
await db.auth.admin.deleteUser(userId);
console.log("user de teste removido");
