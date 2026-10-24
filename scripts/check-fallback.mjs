// Verifica o fallback da busca: Apify sem crédito → Google Places.
// Uso: node scripts/check-fallback.mjs "query" (rodar da raiz do repo)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const email = `tf-${Date.now()}@seekerai.dev`;
const { data: c, error: cErr } = await db.auth.admin.createUser({ email, password: `T!${randomUUID()}`, email_confirm: true });
if (cErr) { console.error(cErr.message); process.exit(1); }
await db.rpc("apply_credit_delta", { p_user: c.user.id, p_delta: 50, p_motivo: "t", p_ref: `t-${Date.now()}` });
const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
const { data: s } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });

const query = process.argv[2] ?? "restaurantes em Curitiba, PR";
const t0 = Date.now();
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/places-search`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${s.session.access_token}`,
    apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query, serviceSlug: "sites", requestRef: randomUUID(), regionCode: "BR" }),
});
const secs = Math.round((Date.now() - t0) / 1000);
const d = await res.json().catch(() => ({}));
const r = d.resultados ?? [];
console.log(`status ${res.status} ${secs}s | provedor: ${d.provedor} | resultados: ${r.length}`);
if (!res.ok) console.log("erro:", JSON.stringify(d).slice(0, 400));
console.log(`  site:${r.filter((p) => p.site).length} ig@:${r.filter((p) => p.instagram).length} ig:${r.filter((p) => p.ig).length} wa:${r.filter((p) => p.whatsapp === true).length} tel:${r.filter((p) => p.telefone).length}`);
for (const p of r.slice(0, 8)) {
  console.log(`  ${(p.nome ?? "").slice(0, 38).padEnd(38)} | ${(p.categoria ?? "-").slice(0, 22).padEnd(22)} | ${p.avaliacao ?? "-"} | ${p.telefone ?? "-"} | ${p.instagram ?? "-"}`);
}
await db.auth.admin.deleteUser(c.user.id);
console.log("user de teste removido");
