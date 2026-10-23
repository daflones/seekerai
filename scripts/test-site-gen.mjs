// Teste e2e do pipeline generate_site: cria usuário de teste, credita,
// cria lead com imagem real e chama a edge function como o app faz.
// Uso: node scripts/test-site-gen.mjs  (rodar de dentro de apps/web —
// usa o node_modules do @supabase/supabase-js)
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

const email = `teste-site-${Date.now()}@seekerai.dev`;
const password = `Teste!${randomUUID()}`;

// 1. usuário de teste
const { data: created, error: cErr } = await db.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (cErr) { console.error("createUser:", cErr.message); process.exit(1); }
const userId = created.user.id;
console.log("user:", userId);

// 2. créditos
const { error: credErr } = await db.rpc("apply_credit_delta", {
  p_user: userId, p_delta: 50, p_motivo: "teste", p_ref: `teste-${Date.now()}`,
});
if (credErr) { console.error("creditos:", credErr.message); process.exit(1); }
console.log("créditos: 50");

// 3. lead com imagem real (padaria do banco, lh3)
const { data: src } = await db.from("leads")
  .select("nome,endereco,bairro,cidade,uf,telefone,avaliacao,total_avaliacoes,imagem,categoria")
  .eq("categoria", "Padaria").not("imagem", "is", null).limit(1).single();
const { data: lead, error: lErr } = await db.from("leads").insert({
  user_id: userId, service_slug: "sites", place_id: `test-${Date.now()}`,
  nome: src.nome, categoria: src.categoria, endereco: src.endereco,
  bairro: src.bairro, cidade: src.cidade, uf: src.uf, telefone: src.telefone,
  avaliacao: src.avaliacao, total_avaliacoes: src.total_avaliacoes,
  imagem: src.imagem, whatsapp: "nao", dados: {},
}).select("id").single();
if (lErr) { console.error("lead:", lErr.message); process.exit(1); }
console.log("lead:", lead.id, "-", src.nome);

// 4. sessão do usuário de teste (signIn bloqueia por captcha → magiclink + verifyOtp)
const { data: link, error: linkErr } = await db.auth.admin.generateLink({
  type: "magiclink", email,
});
if (linkErr) { console.error("generateLink:", linkErr.message); process.exit(1); }
const { data: sess, error: sErr } = await anon.auth.verifyOtp({
  type: "magiclink", token_hash: link.properties.hashed_token,
});
if (sErr || !sess.session) { console.error("verifyOtp:", sErr?.message); process.exit(1); }
console.log("jwt ok");

// 5. chama a edge como o app (ai-jobs) faz
console.log("→ chamando ai-generate generate_site…");
const t0 = Date.now();
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-generate`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${sess.session.access_token}`,
    apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    action: "generate_site",
    serviceSlug: "sites",
    businessRef: lead.id,
    requestRef: randomUUID(),
    lang: "pt",
    prompt: "Crie o site institucional completo deste estabelecimento, pronto para publicar.",
    context: { nome: src.nome, categoria: src.categoria, cidade: src.cidade, imagem: src.imagem },
  }),
});
const data = await res.json().catch(() => ({}));
console.log(`edge: ${res.status} em ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(JSON.stringify({
  siteSlug: data.siteSlug, siteUrl: data.siteUrl, modelo: data.modelo,
  imagensReais: data.imagensReais, imagensGeradas: data.imagensGeradas,
  creditosCobrados: data.creditosCobrados, erro: data.erro ?? data.error,
}, null, 2));

if (data.siteSlug) {
  const { data: site } = await db.from("sites").select("tipo,config").eq("slug", data.siteSlug).single();
  console.log("tipo:", site?.tipo);
  console.log("hero:", site?.config?.fotos?.hero?.split("/").pop());
  console.log("galeria:", site?.config?.fotos?.galeria?.length, "fotos");
  console.log("servicos:", site?.config?.servicos?.map((s) => s.nome).join(", "));
  console.log("tagline:", site?.config?.tagline);
  console.log("faq:", site?.config?.faq?.length);
}
console.log("TEST_LEAD=" + lead.id);
console.log("TEST_USER=" + userId);
