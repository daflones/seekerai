// Benchmark de tempo do places-search por nicho/cidade/serviço.
// Uso: node scripts/bench-search.mjs (rodar de apps/web)
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

const email = `teste-bench-${Date.now()}@seekerai.dev`;
const password = `Teste!${randomUUID()}`;

const { data: created, error: cErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (cErr) { console.error("createUser:", cErr.message); process.exit(1); }
const userId = created.user.id;
await db.rpc("apply_credit_delta", { p_user: userId, p_delta: 200, p_motivo: "bench", p_ref: `bench-${Date.now()}` });

const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
const { data: sess, error: sErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (sErr || !sess.session) { console.error("verifyOtp:", sErr?.message); process.exit(1); }

const combos = [
  ["barbearias em São Paulo, SP", "sites"],
  ["estúdio de tatuagem em Manaus, AM", "social"],
  ["academias em Belo Horizonte, MG", "trafego"],
  ["restaurantes em Curitiba, PR", "sites"],
  ["clínicas de estética em Campinas, SP", "gestao_whatsapp"],
  ["pet shops em Porto Alegre, RS", "sites"],
];

console.log("query".padEnd(46), "serviço".padEnd(18), "tempo", "res", "ig@", "ig✓", "status");
for (const [query, serviceSlug] of combos) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/places-search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sess.session.access_token}`,
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, serviceSlug, requestRef: randomUUID(), regionCode: "BR" }),
    });
    const secs = Math.round((Date.now() - t0) / 1000);
    const data = await res.json().catch(() => ({}));
    const r = data.resultados ?? [];
    console.log(
      query.padEnd(46), serviceSlug.padEnd(18),
      `${secs}s`.padEnd(6), String(r.length).padEnd(4),
      String(r.filter((p) => p.instagram).length).padEnd(4),
      String(r.filter((p) => p.ig).length).padEnd(4),
      res.ok ? "ok" : `ERRO ${res.status}`,
    );
  } catch (e) {
    console.log(query.padEnd(46), serviceSlug.padEnd(18), `${Math.round((Date.now() - t0) / 1000)}s`.padEnd(6), "-   ", "-   ", "-   ", `FALHA ${e.message}`);
  }
}

console.log("TEST_USER=" + userId);
await db.auth.admin.deleteUser(userId);
console.log("user de teste removido");
