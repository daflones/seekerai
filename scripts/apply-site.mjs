#!/usr/bin/env node
/**
 * apply-site.mjs — publica um site premium em /site/<slug> a partir de um lead.
 *
 * Uso:
 *   node scripts/apply-site.mjs --lead <uuid-ou-place_id> \
 *     [--slug barbearia-x] [--config site-templates/configs/x.json] \
 *     [--assets pasta/com/fotos-e-videos]
 *
 * O que faz:
 *   1. Carrega o lead do banco (nome, endereço, telefone, avaliação…).
 *   2. Faz upload de --assets (jpg/png/mp4…) pro bucket público `site-assets`.
 *   3. Monta o SiteConfig (defaults do lead + override do --config).
 *   4. Insere/atualiza a linha em `sites` e marca dados.siteSlug no lead.
 *
 * Requer .env.local na raiz com SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e
 * SUPABASE_SECRET_KEY (ou SERVICE_ROLE_KEY). Roda de dentro de apps/web
 * (usa o node_modules do @supabase/supabase-js) ou com NODE_PATH apontado.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname, basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- args ----------
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
}
if (!args.lead) {
  console.error("Uso: node scripts/apply-site.mjs --lead <uuid|place_id> [--slug x] [--config x.json] [--assets dir]");
  process.exit(1);
}

// ---------- env ----------
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.local");
const env = {};
for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("SUPABASE_URL/SUPABASE_SECRET_KEY ausentes no .env.local"); process.exit(1); }
const db = createClient(url, key);

const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

// ---------- lead ----------
const q = /^[0-9a-f-]{36}$/i.test(args.lead)
  ? db.from("leads").select("*").eq("id", args.lead)
  : db.from("leads").select("*").eq("place_id", args.lead);
const { data: leads, error } = await q.limit(1);
if (error || !leads?.length) { console.error("Lead não encontrado:", error?.message ?? args.lead); process.exit(1); }
const lead = leads[0];
const slug = args.slug ?? slugify(lead.nome);
console.log(`→ lead: ${lead.nome} (${lead.id}) → /site/${slug}`);

// ---------- upload de assets ----------
// Garante o bucket público (não fica na migration — storage.buckets
// não existe nos testes pglite; o script é idempotente).
const { data: buckets } = await db.storage.listBuckets();
if (!buckets?.some((b) => b.id === "site-assets")) {
  const { error: bucketErr } = await db.storage.createBucket("site-assets", {
    public: true,
    fileSizeLimit: 52428800, // 50MB (limite do plano)
    allowedMimeTypes: [
      "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
      "video/mp4", "video/webm", "video/quicktime",
    ],
  });
  if (bucketErr && !/already exists|duplicate/i.test(bucketErr.message)) {
    console.error("Falha ao criar bucket site-assets:", bucketErr.message);
    process.exit(1);
  }
}
const publicBase = `${url}/storage/v1/object/public/site-assets`;
async function upload(filePath) {
  const name = basename(filePath).replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `${slug}/${name}`;
  const body = readFileSync(filePath);
  const mime = /\.(mp4|mov|webm)$/i.test(name) ? "video/mp4"
    : /\.png$/i.test(name) ? "image/png" : "image/jpeg";
  const { error: upErr } = await db.storage.from("site-assets").upload(path, body, {
    contentType: mime, upsert: true,
  });
  if (upErr) throw new Error(`upload ${name}: ${upErr.message}`);
  return `${publicBase}/${path}`;
}

const fotos = [];
const videos = [];
if (args.assets) {
  const dir = resolve(args.assets);
  if (!existsSync(dir)) { console.error(`Pasta não existe: ${dir}`); process.exit(1); }
  const files = readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|mp4|mov|webm)$/i.test(f))
    .map((f) => join(dir, f));
  // dedupe por tamanho (snapinsta costuma baixar o mesmo arquivo 2x)
  const seen = new Set();
  for (const f of files) {
    const size = statSync(f).size;
    if (seen.has(size)) { console.log(`  · pulando duplicata ${basename(f)}`); continue; }
    seen.add(size);
    const pub = await upload(f);
    if (/\.(mp4|mov|webm)$/i.test(f)) videos.push(pub); else fotos.push(pub);
    console.log(`  ↑ ${basename(f)} → ${pub}`);
  }
}
// foto de capa do Maps, se existir (redimensiona pra w1600)
if (lead.imagem && !fotos.length) {
  try {
    const big = lead.imagem.replace(/=w\d+(-h\d+)?-k-no$/, "=w1600-k-no");
    const res = await fetch(big);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const path = `${slug}/capa.jpg`;
      await db.storage.from("site-assets").upload(path, buf, { contentType: "image/jpeg", upsert: true });
      fotos.unshift(`${publicBase}/${path}`);
      console.log(`  ↑ capa do Google → ${publicBase}/${path}`);
    }
  } catch (e) { console.log("  · capa do Google indisponível:", e.message); }
}

// ---------- config ----------
const override = args.config ? JSON.parse(readFileSync(resolve(args.config), "utf8")) : {};
const defaults = {
  tipo: "barbearia",
  nome: lead.nome,
  marca: lead.nome,
  cidade: [lead.cidade, lead.uf].filter(Boolean).join(" · ") || undefined,
  contato: {
    telefone: lead.telefone ?? undefined,
    whatsapp: lead.whatsapp === "sim" || lead.dados?.whatsapp === true
      ? (lead.telefone ?? "").replace(/\D/g, "") : undefined,
    endereco: lead.endereco ?? undefined,
    mapsUrl: lead.maps_url ?? lead.dados?.mapsUrl ?? undefined,
  },
  horarios: { "0": null, "1": [["09:00", "19:00"]], "2": [["09:00", "19:00"]], "3": [["09:00", "19:00"]], "4": [["09:00", "19:00"]], "5": [["09:00", "19:00"]], "6": [["09:00", "14:00"]] },
  horariosLabel: [["Segunda a sexta", "09:00 – 19:00"], ["Sábado", "09:00 – 14:00"], ["Domingo", "Fechado"]],
  servicos: [
    { nome: "Corte", duracaoMin: 40, preco: null },
    { nome: "Barba", duracaoMin: 30, preco: null },
    { nome: "Corte + Barba", duracaoMin: 70, preco: null },
  ],
  avaliacoes: lead.avaliacao ? { nota: lead.avaliacao, total: lead.total_avaliacoes ?? 0, fonte: "Google" } : undefined,
  booking: { slotMin: 30, diasFuturos: 14, antecedenciaMin: 30 },
  seo: { title: lead.nome, description: lead.endereco ?? undefined },
};
// merge raso por seção (config do arquivo vence defaults)
const config = { ...defaults, ...override };
config.contato = { ...defaults.contato, ...override.contato };
config.seo = { ...defaults.seo, ...override.seo };
config.avaliacoes = { ...defaults.avaliacoes, ...override.avaliacoes };
config.booking = { ...defaults.booking, ...override.booking };
config.nome = lead.nome;
// logo: --logo sobe o arquivo; no config JSON aceita URL absoluta ou nome
// de arquivo já publicado em site-assets/<slug>/.
if (args.logo) {
  const logoFile = resolve(args.logo);
  if (!existsSync(logoFile)) { console.error(`Logo não existe: ${logoFile}`); process.exit(1); }
  const ext = extname(logoFile).toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const mime = ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";
  const path = `${slug}/logo.${ext}`;
  const { error: logoErr } = await db.storage.from("site-assets")
    .upload(path, readFileSync(logoFile), { contentType: mime, upsert: true });
  if (logoErr) { console.error("Falha no upload da logo:", logoErr.message); process.exit(1); }
  config.logo = `${publicBase}/${path}`;
  console.log(`  ↑ logo → ${publicBase}/${path}`);
} else if (override.logo) {
  config.logo = /^https?:/.test(override.logo) ? override.logo : `${publicBase}/${slug}/${override.logo}`;
}
// hero: config vence (aceita URL absoluta ou nome de arquivo enviado em --assets);
// fallback: primeiro arquivo que pareça capa, senão a primeira foto.
const heroWanted = override.fotos?.hero;
const heroPick = heroWanted
  ? (/^https?:/.test(heroWanted)
      ? heroWanted
      : fotos.find((f) => f.endsWith("/" + heroWanted) || f.endsWith(heroWanted)))
  : (fotos.find((f) => /equipe|hero|capa|cover|team/i.test(f)) ?? fotos[0]);
if (heroWanted && !heroPick) console.log(`  · aviso: hero "${heroWanted}" não achado nos assets`);
config.fotos = {
  hero: heroPick,
  galeria: fotos.length ? fotos.filter((f) => f !== heroPick) : (override.fotos?.galeria ?? []),
};
if (videos.length || override.videos) {
  const meta = override.videos ?? [];
  config.videos = videos.map((src, i) => ({
    src, titulo: meta[i]?.titulo ?? `Vídeo ${i + 1}`,
    descricao: meta[i]?.descricao, destaque: meta[i]?.destaque,
  }));
  if (!videos.length) config.videos = meta;
}

// ---------- publica ----------
const row = { slug, tipo: config.tipo, nome: lead.nome, lead_id: lead.id, config, publicado: true };
const { error: siteErr } = await db.from("sites").upsert(row, { onConflict: "slug" });
if (siteErr) { console.error("Falha ao publicar:", siteErr.message); process.exit(1); }

// marca o slug no lead (card "Ver site" do workspace aponta pra cá)
await db.from("leads").update({ dados: { ...lead.dados, siteSlug: slug } }).eq("id", lead.id);

console.log(`\n✓ publicado: /site/${slug}`);
console.log(`  ${fotos.length} foto(s), ${videos.length} vídeo(s), ${config.servicos.length} serviço(s)`);
