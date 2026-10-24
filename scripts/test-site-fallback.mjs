// Testa generate_site com fallback: Apify sem crédito → Google Places.
// Uso: node scripts/test-site-fallback.mjs <leadId> (rodar da raiz do repo)
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

const leadId = process.argv[2];
if (!leadId) { console.error("uso: node scripts/test-site-fallback.mjs <leadId>"); process.exit(1); }
const { data: lead } = await db.from("leads").select("id,nome,categoria,place_id,avaliacao,total_avaliacoes,instagram,site").eq("id", leadId).maybeSingle();
console.log("lead:", JSON.stringify(lead));

const email = `tf-${Date.now()}@seekerai.dev`;
const { data: c } = await db.auth.admin.createUser({ email, password: `T!${randomUUID()}`, email_confirm: true });
await db.rpc("apply_credit_delta", { p_user: c.user.id, p_delta: 50, p_motivo: "t", p_ref: `t-${Date.now()}` });
const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
const { data: s } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });

const t0 = Date.now();
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-generate`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${s.session.access_token}`,
    apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    action: "generate_site", serviceSlug: "sites", businessRef: leadId,
    requestRef: randomUUID(), prompt: "site teste fallback", lang: "pt",
  }),
  signal: AbortSignal.timeout(200_000),
});
const secs = Math.round((Date.now() - t0) / 1000);
const d = await res.json().catch(() => ({}));
console.log(`status ${res.status} ${secs}s | slug: ${d.siteSlug} | url: ${d.siteUrl}`);
console.log(`reais:${d.imagensReais} geradas:${d.imagensGeradas} modelo:${d.modelo}`);
console.log("debug:", JSON.stringify(d.debug));
if (!res.ok) console.log("erro:", JSON.stringify(d).slice(0, 500));
const { data: site } = await db.from("sites").select("config").eq("slug", d.siteSlug ?? "").maybeSingle();
if (site) {
  const cfg = site.config;
  console.log(`servicos: ${(cfg.servicos ?? []).length} | avaliacoes.itens: ${(cfg.avaliacoes?.itens ?? []).length} | horariosLabel: ${(cfg.horariosLabel ?? []).length} | fotos.galeria: ${(cfg.fotos?.galeria ?? []).length}`);
}
await db.auth.admin.deleteUser(c.user.id);
