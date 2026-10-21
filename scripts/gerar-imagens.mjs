import { readFile, writeFile, mkdir, access, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const id = args.find((arg) => arg.startsWith("--id="))?.slice(5);
const generate = args.includes("--generate");
const model = process.env.OPENROUTER_IMAGE_MODEL || "recraft/recraft-v4.1-flash";
const allowed = new Set(["hero-cosmos", "brand-orbit"]);

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function main() {
  const source = await readFile(path.join(root, "docs/PROMPTS-IMAGENS.md"), "utf8");
  const prompts = [...source.matchAll(/```json\r?\n([\s\S]+?)```/g)].map((match) => JSON.parse(match[1]));
  if (!id || !allowed.has(id)) {
    console.log("IDs aprovados: hero-cosmos, brand-orbit. Use --id=ID para inspecionar; --generate autoriza uma chamada paga.");
    return;
  }
  const prompt = prompts.find((item) => item.id === id);
  if (!prompt) throw new Error("Prompt não encontrado.");
  if (!generate) {
    console.log(JSON.stringify({ ...prompt, model, dry_run: true }, null, 2));
    return;
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY não configurada.");
  if (model !== "recraft/recraft-v4.1-flash") {
    throw new Error("Modelo fora do orçamento aprovado. Revise preços e autorização antes de alterar.");
  }
  const endpoint = await fetch(`https://openrouter.ai/api/v1/images/models/${model}/endpoints`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!endpoint.ok) throw new Error(`Consulta de preço indisponível (HTTP ${endpoint.status}).`);
  const pricing = await endpoint.json();
  const endpoints = pricing.endpoints ?? [];
  // Fail closed if any available route has unknown or increased pricing.
  if (!endpoints.length || !endpoints.every((item) =>
    Array.isArray(item.pricing) && item.pricing.length > 0 &&
    item.pricing.every((price) =>
      price.billable === "output_image" && price.unit === "image" && price.cost_usd <= 0.007
    )
  )) throw new Error("Preço não verificável ou acima de USD 0.007/imagem. Nenhuma geração enviada.");

  const directory = path.join(root, "apps/web/public/brand");
  const cache = path.join(root, ".cache/images");
  await mkdir(directory, { recursive: true });
  await mkdir(cache, { recursive: true });
  const metadataFile = path.join(directory, `${id}.json`);
  const lock = path.join(cache, `${id}.pending`);
  const rawFile = path.join(cache, `${id}.source`);
  if (await exists(metadataFile)) {
    console.log(`${id}: já existe; nenhuma chamada paga.`);
    return;
  }
  if (await exists(lock)) {
    throw new Error("Geração pendente ou interrompida. Verifique a cobrança e o cache; não há retry automático.");
  }
  await writeFile(lock, JSON.stringify({ id, model, started_at: new Date().toISOString() }), { flag: "wx" });
  console.log(`${id}: enviando uma única geração, preço publicado USD 0.007.`);
  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "SeekerAi Brand Assets" },
    body: JSON.stringify({ model, prompt: prompt.prompt, aspect_ratio: prompt.aspect_ratio, n: 1 }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`Geração falhou (HTTP ${response.status}). Não haverá nova tentativa automática.`);
  const result = await response.json();
  const image = result.data?.[0];
  if (!image?.b64_json || typeof image.b64_json !== "string") {
    throw new Error("A API não retornou uma imagem base64. Verifique a cobrança antes de tentar novamente.");
  }
  const bytes = Buffer.from(image.b64_json, "base64");
  await writeFile(rawFile, bytes, { flag: "wx" });
  const sizes = id === "hero-cosmos" ? [768, 1440] : [384, 768];
  for (const width of sizes) {
    await sharp(bytes).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(directory, `${id}-${width}.webp`));
    await sharp(bytes).resize({ width, withoutEnlargement: true }).avif({ quality: 52 }).toFile(path.join(directory, `${id}-${width}.avif`));
  }
  const metadata = {
    id,
    model,
    generated_at: new Date().toISOString(),
    advertised_cost_usd: 0.007,
    reported_cost_usd: result.usage?.cost ?? null,
    sizes,
    source: "OpenRouter Image API",
  };
  await writeFile(metadataFile, JSON.stringify(metadata, null, 2) + "\n", { flag: "wx" });
  await unlink(lock);
  console.log(JSON.stringify(metadata));
}

main().catch((error) => {
  // Never print the response body, request headers, environment or API key.
  console.error(error instanceof Error ? error.message : "Falha na geração.");
  process.exitCode = 1;
});
