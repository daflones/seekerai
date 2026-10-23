// Geração com IA via OpenRouter — deep_strategy, sales_reply, generate_site,
// generate_image. Se o OpenRouter falhar, cai para a NVIDIA (build.nvidia.com)
// como fallback gratuito — texto via chat/completions e imagem via genai.
// Chaves ficam como secrets do Supabase; consome créditos.
//
// generate_site é um pipeline: usa imagens reais do contexto (Apify/Places)
// e, se faltar material visual, gera imagens dedicadas via modelo de imagem
// antes de montar o HTML — sem emojis, visual high-end.

import {
  asString,
  fail,
  HttpError,
  httpError,
  isRecord,
  json,
  optionalEnv,
  readJson,
  requirePost,
  requireUser,
  reserveAction,
  serviceClient,
  settleAction,
  sha256Hex,
} from "../_shared/common.ts";
import { getSecret, requireSecret } from "../_shared/secrets.ts";

const ACTIONS = new Set([
  "deep_strategy",
  "sales_reply",
  "generate_site",
  "generate_image",
  "lead_assist",
  "image_prompt",
]);

const TEXT_MODEL = optionalEnv("AI_TEXT_MODEL") ?? "openai/gpt-4o-mini";
const IMAGE_MODEL = optionalEnv("AI_IMAGE_MODEL") ?? "google/gemini-2.5-flash-image";
const SITE_MODEL = optionalEnv("AI_SITE_MODEL") ?? "anthropic/claude-sonnet-4.5";
const MAX_SITE_IMAGES = 8;
// Alvo de mídia do site premium: 1 hero + galeria p/ corredor 3D e masonry.
// O que o lead não tiver de imagem real a IA gera (até o teto abaixo).
const SITE_IMAGE_TARGET = 6;
const MAX_GENERATED_IMAGES = 5;

// Fallback NVIDIA (build.nvidia.com) — gratuito, OpenAI-compatible.
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_TEXT_MODEL = optionalEnv("NVIDIA_TEXT_MODEL") ?? "z-ai/glm-5.3-flash";
const NVIDIA_IMAGE_MODEL = optionalEnv("NVIDIA_IMAGE_MODEL") ?? "black-forest-labs/flux.2-klein-4b";

/** Chat de texto na NVIDIA — mesmo formato OpenAI. Retorna o JSON ou null. */
async function nvidiaChat(
  system: string,
  userContent: string,
  maxTokens?: number,
  timeoutMs?: number,
): Promise<Record<string, unknown> | null> {
  const key = await getSecret("NVIDIA_API_KEY");
  if (!key) return null;
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: NVIDIA_TEXT_MODEL,
      stream: false,
      max_tokens: maxTokens ?? 4096,
      // GLM "thinking" desligado — resposta direta, latência menor.
      ...(NVIDIA_TEXT_MODEL.includes("glm") ? {
        reasoning_effort: "low",
        chat_template_kwargs: { clear_thinking: true, enable_thinking: false },
      } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
    // Site leva minutos num provedor gratuito — timeout vem de fora.
    signal: AbortSignal.timeout(timeoutMs ?? 120_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.error("[nvidia] chat falhou:", res?.status ?? "network");
    return null;
  }
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/** Imagem na NVIDIA (genai/FLUX). Retorna data URL ou null. */
async function nvidiaImage(prompt: string): Promise<string | null> {
  const key = await getSecret("NVIDIA_API_KEY");
  if (!key) return null;
  const res = await fetch(`https://ai.api.nvidia.com/v1/genai/${NVIDIA_IMAGE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      prompt: prompt.slice(0, 10_000),
      width: 1024, height: 1024,
      cfg_scale: 1, samples: 1,
      seed: Math.floor(Math.random() * 2_147_483_647),
      steps: 4,
    }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.error("[nvidia] imagem falhou:", res?.status ?? "network");
    return null;
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
  const b64 = isRecord(artifacts[0]) ? asString(artifacts[0].base64, 8_000_000) : null;
  return b64 ? `data:image/jpeg;base64,${b64}` : null;
}

/** Traduz/melhora o pedido do usuário para um prompt de imagem em inglês. */
async function enhanceImagePrompt(
  userPrompt: string,
  context: Record<string, unknown>,
): Promise<string> {
  const nome = asString(context.nome) ?? "";
  const categoria = asString(context.categoria) ?? "";
  const cidade = [asString(context.cidade), asString(context.uf)].filter(Boolean).join(" - ");
  const res = await nvidiaChat(
    [
      "You are a senior art director writing text-to-image prompts for FLUX.",
      "Rewrite the user's request (Portuguese) as ONE optimized English image prompt.",
      "Photorealistic commercial/editorial quality; describe scene, lighting and composition explicitly.",
      nome
        ? `Business: ${nome}${categoria ? ` (${categoria})` : ""}${cidade ? ` — ${cidade}, Brazil` : ""}. Weave the real business identity into the scene (products, signage, colors); never invent another business.`
        : categoria ? `Business category: ${categoria}.` : "",
      "If the user asked for a promo post/ad with text, include the EXACT short headline to render inside double quotes (keep it in Portuguese, max 5 words, spelled correctly). If not asked for, end with 'no text, no letters, no words'.",
      "Reply with ONLY the image prompt — no explanations.",
    ].filter(Boolean).join("\n"),
    userPrompt,
    500,
  ).catch(() => null);
  const choices = res && Array.isArray(res.choices) ? res.choices : [];
  const content = isRecord(choices[0]) && isRecord(choices[0].message)
    ? choices[0].message.content
    : null;
  return typeof content === "string" && content.trim().length > 20
    ? content.trim()
    : userPrompt;
}

interface GenerateBody {
  action?: string;
  businessRef?: string;
  serviceSlug?: string;
  requestRef?: string;
  prompt?: string;
  lang?: string;
  context?: Record<string, unknown>;
}

// Nome do idioma pra instrução de sistema — o modelo responde na língua do usuário.
const LANG_NAMES: Record<string, string> = {
  pt: "português brasileiro (pt-BR)",
  en: "English",
  es: "español",
  fr: "français",
  de: "Deutsch",
  it: "italiano",
};

function langName(lang: string | undefined): string {
  return LANG_NAMES[lang ?? "pt"] ?? LANG_NAMES.pt;
}

function systemPromptFor(action: string, lang: string): string {
  const L = langName(lang);
  switch (action) {
    case "deep_strategy":
      return `Você é um estrategista de vendas B2B experiente. Analise o estabelecimento e produza: diagnóstico, oportunidades, ângulos de abordagem e próximos passos práticos. Responda OBRIGATORIAMENTE em ${L}, direto e acionável.`;
    case "sales_reply":
      return `Você é um copiloto de vendas. Escreva uma mensagem de abordagem curta, personalizada e natural em ${L} para o estabelecimento descrito. Sem emojis excessivos, sem promessas irreais.`;
    case "lead_assist":
      return [
        "Você é o copiloto de conversão do SeekerAi: um closer B2B experiente",
        "acompanhando este lead específico em tempo real.",
        "Use TODOS os dados do contexto (estabelecimento, avaliações, site, WhatsApp, status",
        "do funil e o que já foi gerado) para responder de forma concreta.",
        "Ajude a converter: sugira ângulos de abordagem, mensagens prontas para copiar,",
        "respostas para objeções, próximos passos e o que fazer em cada etapa do funil",
        "(novo → contatado → respondeu → proposta → ganho).",
        `Respostas curtas e diretas OBRIGATORIAMENTE em ${L}, com mensagens prontas entre aspas quando fizer sentido.`,
      ].join("\n");
    case "generate_image":
      return [
        "Você é um diretor de arte e fotógrafo comercial premiado.",
        "Crie UMA imagem de altíssima qualidade atendendo fielmente ao pedido do usuário.",
        "Direção de arte obrigatória: acabamento profissional/editorial, iluminação estudada e realista,",
        "composição intencional, cores coesas e sofisticadas, nitidez de produto premium.",
        "Sem texto na imagem a menos que o usuário peça explicitamente. Sem marcas d'água, sem emojis.",
      ].join("\n");
    default:
      return `Responda em ${L}.`;
  }
}

/** Gera imagem via OpenRouter; se falhar (ou não houver chave), cai pra NVIDIA. */
async function generateSiteImage(
  apiKey: string | null,
  imagePrompt: string,
): Promise<string | null> {
  const res = apiKey
    ? await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": optionalEnv("APP_URL") ?? "https://seekerai.digital",
        "X-Title": "SeekerAi",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        modalities: ["image", "text"],
        messages: [{ role: "user", content: imagePrompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null)
    : null;
  if (res?.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const message = isRecord(choices[0]) && isRecord(choices[0].message)
      ? choices[0].message
      : {};
    if (Array.isArray(message.images)) {
      for (const img of message.images) {
        const url = isRecord(img) && isRecord(img.image_url) ? img.image_url.url : null;
        if (typeof url === "string") return url;
      }
    }
  } else if (apiKey) {
    console.error("[site-image] openrouter falhou:", res?.status ?? "network");
  }
  return nvidiaImage(imagePrompt);
}

// ---------- pipeline do site premium (/site/<slug>) ----------
// Em vez de um HTML blob em lead_outputs, generate_site publica uma linha
// em `sites` (SiteConfig) + assets em site-assets/<slug>/ — renderizado
// pelo React multi-tenant (barbearia dark / beleza editorial claro).

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "site";

/** Tema visual por categoria do negócio. */
function siteTipoFor(categoria: string | null): "barbearia" | "beleza" {
  const c = (categoria ?? "").toLowerCase();
  return /barbearia|barber|barbeiro/.test(c) ? "barbearia" : "beleza";
}

/** Resolve referências de imagem do lead/contexto em URLs baixáveis. */
async function resolveLeadImageSources(
  lead: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<string[]> {
  const sources = new Set<string>();
  const add = (v: unknown) => {
    const s = asString(v, 1200);
    if (s && s.startsWith("http")) sources.add(s);
  };
  // dados.imagens pode guardar urls do scrape/manual; contexto traz o que o front mandou.
  const dados = isRecord(lead.dados) ? lead.dados : {};
  for (const bag of [dados, context]) {
    for (const key of ["imagens", "images", "photos"]) {
      const arr = bag[key];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === "string") add(item);
          else if (isRecord(item)) add(item.url ?? item.photoUri);
        }
      }
    }
  }
  add(lead.imagem);
  add(context.imagem);

  // gphoto:places/.../photos/... precisa resolver via Places API.
  const resolved = new Set<string>();
  const googleKey = await getSecret("GOOGLE_PLACES_API_KEY");
  for (const src of [asString(lead.imagem, 800), asString(context.imagem, 800)]) {
    if (src?.startsWith("gphoto:") && googleKey) {
      const ref = src.slice(7);
      if (/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref)) {
        const res = await fetch(
          `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=1600&skipHttpRedirect=true&key=${googleKey}`,
          { signal: AbortSignal.timeout(15_000) },
        ).catch(() => null);
        const data = res?.ok ? await res.json().catch(() => null) : null;
        const uri = isRecord(data) ? asString(data.photoUri, 1200) : null;
        if (uri) resolved.add(uri);
      }
    }
  }
  return [...resolved, ...sources].slice(0, MAX_SITE_IMAGES);
}

/** Baixa uma imagem remota → bytes, ou null se falhar. */
async function fetchImageBytes(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!res?.ok) return null;
  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!contentType.startsWith("image/")) return null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType };
}

/** Upload pro bucket público site-assets, com retry — Storage falha intermitente. */
async function uploadSiteAsset(
  db: ReturnType<typeof serviceClient>,
  slug: string,
  name: string,
  body: Uint8Array,
  contentType: string,
): Promise<string | null> {
  const base = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/site-assets`;
  let lastErr = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { error } = await db.storage.from("site-assets")
      .upload(`${slug}/${name}`, body, { contentType, upsert: true });
    if (!error) return `${base}/${slug}/${name}`;
    lastErr = error.message;
    await new Promise((r) => setTimeout(r, 700 * attempt));
  }
  console.error(`[site] upload ${name}:`, lastErr);
  return null;
}

async function ensureSiteBucket(db: ReturnType<typeof serviceClient>): Promise<void> {
  const { data: buckets } = await db.storage.listBuckets();
  if (buckets?.some((b: { id: string }) => b.id === "site-assets")) return;
  await db.storage.createBucket("site-assets", {
    public: true,
    fileSizeLimit: 52428800,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"],
  }).then(({ error }) => {
    if (error && !/already exists|duplicate/i.test(error.message)) {
      console.error("[site] bucket:", error.message);
    }
  });
}

/**
 * PROMPT ESPECÍFICO dos assets do site — direção de arte por slot.
 * O que o lead não tem de mídia real a IA preenche com isto:
 * hero editorial, ambiente, detalhe do trabalho, resultado e textura.
 * Inglês porque os modelos de imagem performam melhor; identidade real
 * do negócio (nome/categoria/cidade) vai embutida na cena.
 */
function siteAssetPrompts(
  lead: { nome: string; categoria: string | null; cidade: string | null },
  tipo: "barbearia" | "beleza",
): string[] {
  const biz = `"${lead.nome}", a ${lead.categoria ?? "local business"} in ${lead.cidade ?? "Brazil"}, Brazil`;
  const direction = tipo === "barbearia"
    ? "Dark moody cinematic look: charcoal and graphite tones, warm amber rim light, subtle haze, brass and leather textures, premium barbershop atmosphere, shallow depth of field"
    : "Bright editorial look: ivory and champagne tones, soft natural window light, airy elegant surfaces, delicate gold accents, premium beauty-studio atmosphere, shallow depth of field";
  const scenes = [
    `wide establishing shot of the interior of ${biz}, hero image for the website, inviting composition with clear focal point`,
    `elegant interior detail of ${biz} — the client chair/station and ambient decor, magazine-style composition`,
    `close-up of the signature work at ${biz} — tools and craft in action, hands only, no faces`,
    `a finished result from ${biz} presented like a portfolio photograph, aspirational but believable`,
    `flat-lay of the products and materials used at ${biz}, arranged with generous negative space`,
  ];
  return scenes.map((scene) =>
    `Award-winning editorial commercial photograph: ${scene}. ${direction}. ` +
    "Photorealistic, shot on a 50mm lens, color-graded, high dynamic range. " +
    "No text, no letters, no logos, no watermark, no visible faces."
  );
}

/** SiteConfig determinístico — só fatos confirmados do lead. */
function baseSiteConfig(lead: Record<string, unknown>, tipo: string): Record<string, unknown> {
  const dados = isRecord(lead.dados) ? lead.dados : {};
  const cidade = [asString(lead.cidade), asString(lead.uf)].filter(Boolean).join(" · ");
  const instagram = asString(lead.instagram, 200);
  const telefone = asString(lead.telefone, 60);
  const whatsapp = lead.whatsapp === "sim" || dados.whatsapp === true
    ? (telefone ?? "").replace(/\D/g, "") : undefined;
  return {
    tipo,
    nome: asString(lead.nome, 150) ?? "Estabelecimento",
    marca: asString(lead.nome, 150) ?? "Estabelecimento",
    cidade: cidade || undefined,
    contato: {
      telefone: telefone ?? undefined,
      whatsapp: whatsapp || undefined,
      instagram: instagram
        ? (instagram.startsWith("http") ? instagram : `https://instagram.com/${instagram.replace(/^@/, "")}`)
        : undefined,
      endereco: asString(lead.endereco, 300) ?? undefined,
      mapsUrl: asString(lead.maps_url, 800) ?? asString(dados.mapsUrl, 800) ?? undefined,
    },
    horarios: { "0": null, "1": [["09:00", "19:00"]], "2": [["09:00", "19:00"]], "3": [["09:00", "19:00"]], "4": [["09:00", "19:00"]], "5": [["09:00", "19:00"]], "6": [["09:00", "14:00"]] },
    horariosLabel: [["Segunda a sexta", "09:00 – 19:00"], ["Sábado", "09:00 – 14:00"], ["Domingo", "Fechado"]],
    servicos: [],
    avaliacoes: typeof lead.avaliacao === "number"
      ? { nota: lead.avaliacao, total: typeof lead.total_avaliacoes === "number" ? lead.total_avaliacoes : 0, fonte: "Google" }
      : undefined,
    booking: { slotMin: 30, diasFuturos: 14, antecedenciaMin: 30 },
    seo: { title: asString(lead.nome, 150) ?? undefined, description: asString(lead.endereco, 200) ?? undefined },
  };
}

/** Sanitiza o patch de IA — aceita só campos conhecidos, com tetos. */
function sanitizeConfigPatch(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const patch: Record<string, unknown> = {};
  const str = (v: unknown, max = 200) => asString(v, max) ?? undefined;

  patch.tagline = str(raw.tagline, 120);
  if (Array.isArray(raw.servicos)) {
    patch.servicos = raw.servicos.filter(isRecord).slice(0, 12).map((s) => ({
      nome: str(s.nome, 80) ?? "Serviço",
      duracaoMin: typeof s.duracaoMin === "number" && s.duracaoMin >= 10 && s.duracaoMin <= 480
        ? Math.round(s.duracaoMin) : null,
      preco: null, // nunca inventa preço
      categoria: str(s.categoria, 60),
      descricao: str(s.descricao, 200),
    })).filter((s) => s.nome !== "Serviço");
    if (!(patch.servicos as unknown[]).length) delete patch.servicos;
  }
  if (isRecord(raw.historia)) {
    const paragrafos = Array.isArray(raw.historia.paragrafos)
      ? raw.historia.paragrafos.map((p) => str(p, 800)).filter(Boolean).slice(0, 3) as string[]
      : [];
    if (paragrafos.length) patch.historia = { titulo: str(raw.historia.titulo, 80) ?? "Nossa história", paragrafos };
  }
  if (Array.isArray(raw.diferenciais)) {
    const d = raw.diferenciais.map((x) => str(x, 120)).filter(Boolean).slice(0, 6) as string[];
    if (d.length) patch.diferenciais = d;
  }
  if (Array.isArray(raw.faq)) {
    const f = raw.faq.filter(isRecord).slice(0, 8)
      .map((x) => ({ q: str(x.q, 160), a: str(x.a, 500) }))
      .filter((x) => x.q && x.a);
    if (f.length) patch.faq = f;
  }
  if (Array.isArray(raw.horariosLabel)) {
    const h = raw.horariosLabel.filter(Array.isArray).slice(0, 7)
      .map((x) => [str(x[0], 60), str(x[1], 60)]).filter((x) => x[0] && x[1]);
    if (h.length) patch.horariosLabel = h;
  }
  if (isRecord(raw.seo)) {
    const desc = str(raw.seo.description, 160);
    if (desc) patch.seo = { description: desc };
  }
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
  return patch;
}

const CONFIG_PATCH_SYSTEM = [
  "Você é um diretor de arte e copywriter sênior montando o SiteConfig JSON de um site premium.",
  "Responda APENAS com JSON válido (sem markdown, sem comentários) neste formato exato:",
  '{ "tagline": "frase curta de marca", "servicos": [{"nome":"…","categoria":"…","descricao":"…","duracaoMin":null}],',
  '  "historia": {"titulo":"…","paragrafos":["…","…"]}, "diferenciais":["…"],',
  '  "faq":[{"q":"…","a":"…"}], "horariosLabel":[["Segunda a sexta","09:00 – 19:00"]], "seo":{"description":"…"} }',
  "REGRAS:",
  "- Use SOMENTE os fatos dados (nome, categoria, cidade, avaliações, serviços citados). Não invente preços, profissionais, prêmios ou números.",
  "- Se os serviços reais não estiverem claros, proponha os 4-8 serviços mais típicos da categoria, com duracaoMin plausível (30-120) e preco SEMPRE null.",
  "- tagline: elegante, max 8 palavras, no tom do negócio.",
  "- historia: 2 parágrafos acolhedores sobre a proposta do espaço — sem inventar datas/fatos; pode falar de proposta e experiência, não de biografia.",
  "- faq: 4-6 perguntas práticas (agendamento, formas de pagamento, duração, preparo) com respostas honestas e genéricas.",
  "- seo.description: 1 frase com nome + categoria + cidade.",
  "- Todo o texto em português brasileiro, sem emojis.",
].join("\n");

async function configPatchFromAi(
  apiKey: string | null,
  lead: Record<string, unknown>,
): Promise<{ patch: Record<string, unknown>; modelo: string }> {
  const facts = {
    nome: lead.nome, categoria: lead.categoria, cidade: lead.cidade, uf: lead.uf,
    endereco: lead.endereco, avaliacao: lead.avaliacao, totalAvaliacoes: lead.total_avaliacoes,
    instagram: lead.instagram, temWhatsApp: lead.whatsapp === "sim",
  };
  const userContent = `Estabelecimento:\n${JSON.stringify(facts)}`;

  // OpenRouter primeiro; NVIDIA gratuita se falhar ou não houver chave.
  let content: unknown = null;
  let modelo = SITE_MODEL;
  if (apiKey) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        "HTTP-Referer": optionalEnv("APP_URL") ?? "https://seekerai.digital", "X-Title": "SeekerAi",
      },
      body: JSON.stringify({
        model: SITE_MODEL,
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CONFIG_PATCH_SYSTEM },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null) as Record<string, unknown> | null;
      const choices = data && Array.isArray(data.choices) ? data.choices : [];
      content = isRecord(choices[0]) && isRecord(choices[0].message)
        ? choices[0].message.content : null;
    } else {
      console.error("[site-config] openrouter falhou:", res?.status ?? "network");
    }
  }
  if (typeof content !== "string" || !content.trim()) {
    const nv = await nvidiaChat(CONFIG_PATCH_SYSTEM, userContent, 2500, 120_000);
    const nvChoices = nv && Array.isArray(nv.choices) ? nv.choices : [];
    const nvContent = isRecord(nvChoices[0]) && isRecord(nvChoices[0].message)
      ? nvChoices[0].message.content : null;
    if (typeof nvContent === "string" && nvContent.trim()) {
      content = nvContent;
      modelo = NVIDIA_TEXT_MODEL;
      console.log("[site-config] respondido via NVIDIA (fallback)");
    }
  }
  if (typeof content !== "string") return { patch: {}, modelo: "base" };
  try {
    return {
      patch: sanitizeConfigPatch(
        JSON.parse(content.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim()),
      ),
      modelo,
    };
  } catch {
    return { patch: {}, modelo: "base" };
  }
}

/** Card HTML que vai pro lead_outputs — o workspace renderiza em iframe. */
function siteCardHtml(slug: string, nome: string, hero: string | null): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0e0b08;color:#f5ead9;font-family:system-ui,sans-serif}
.card{max-width:420px;width:calc(100% - 48px);text-align:center;padding:32px 28px;border:1px solid #3a3128;border-radius:18px;background:#171310}
.card img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;margin-bottom:18px}
h1{font-size:20px;margin:0 0 6px}p{color:#a89880;font-size:13px;margin:0 0 20px}
a{display:inline-block;padding:12px 26px;border-radius:99px;background:#c9a869;color:#17110a;font-weight:700;text-decoration:none;font-size:14px}
</style></head><body><div class="card">${hero ? `<img src="${esc(hero)}" alt="">` : ""}
<h1>Site publicado</h1><p>${esc(nome)} · /site/${esc(slug)}</p>
<a href="/site/${esc(slug)}" target="_top">Abrir site</a></div></body></html>`;
}

/**
 * Publica o site premium do lead: imagens reais primeiro, IA preenche o
 * que faltar (hero/corredor 3D), SiteConfig com fatos + patch de IA.
 * Retorna slug + urls publicadas, ou lança HttpError.
 */
async function publishPremiumSite(
  db: ReturnType<typeof serviceClient>,
  apiKey: string | null,
  leadId: string,
  context: Record<string, unknown>,
): Promise<{ slug: string; nome: string; siteUrl: string; hero: string | null; modelo: string; geradas: number; reais: number }> {
  const { data: lead } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) throw httpError(404, "Lead não encontrado");

  const dados = isRecord(lead.dados) ? lead.dados : {};
  const nome = asString(lead.nome, 150) ?? "estabelecimento";
  const tipo = siteTipoFor(asString(lead.categoria, 150));

  // Slug: o do lead se já existir; senão nome+bairro/cidade sem colidir.
  let slug = asString(dados.siteSlug, 80) ??
    slugify([nome, asString(lead.bairro, 80) ?? asString(lead.cidade, 80)].filter(Boolean).join(" "));
  const { data: owner } = await db.from("sites").select("lead_id").eq("slug", slug).maybeSingle();
  if (owner && owner.lead_id !== leadId) {
    const base = slug;
    for (let i = 2; i < 20; i++) {
      slug = `${base}-${i}`;
      const { data: clash } = await db.from("sites").select("slug").eq("slug", slug).maybeSingle();
      if (!clash) break;
    }
  }

  await ensureSiteBucket(db);

  // 1) Imagens reais: baixa e re-hospeda (URLs do Google/Apify expiram).
  const sources = await resolveLeadImageSources(lead, context);
  const publicUrls: { url: string; real: boolean }[] = [];
  {
    const downloads = await Promise.all(sources.map(fetchImageBytes));
    let i = 0;
    for (const dl of downloads) {
      if (!dl) continue;
      const ext = dl.contentType.includes("png") ? "png" : dl.contentType.includes("webp") ? "webp" : "jpg";
      const url = await uploadSiteAsset(db, slug, `real-${++i}.${ext}`, dl.bytes, dl.contentType);
      if (url) publicUrls.push({ url, real: true });
    }
  }

  // 2) Gap-fill com IA — prompt específico por slot, direção de arte do tema.
  const faltando = Math.min(SITE_IMAGE_TARGET - publicUrls.length, MAX_GENERATED_IMAGES);
  if (faltando > 0) {
    const prompts = siteAssetPrompts(
      { nome, categoria: asString(lead.categoria, 150), cidade: asString(lead.cidade, 80) }, tipo,
    ).slice(0, faltando);
    const generated = await Promise.all(prompts.map((p) => generateSiteImage(apiKey, p)));
    let i = 0;
    for (const img of generated) {
      if (!img) continue;
      let dl: { bytes: Uint8Array; contentType: string } | null = null;
      const m = img.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/s);
      if (m) {
        dl = { bytes: Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), contentType: `image/${m[1]}` };
      } else if (img.startsWith("http")) {
        dl = await fetchImageBytes(img);
      }
      if (!dl) continue;
      const ext = dl.contentType.includes("png") ? "png" : dl.contentType.includes("webp") ? "webp" : "jpg";
      const url = await uploadSiteAsset(db, slug, `ai-${++i}.${ext}`, dl.bytes, dl.contentType);
      if (url) publicUrls.push({ url, real: false });
    }
  }

  // 3) SiteConfig: base determinística + patch de IA (OpenRouter → NVIDIA).
  const config = baseSiteConfig(lead, tipo);
  const { patch, modelo } = await configPatchFromAi(apiKey, lead);
  Object.assign(config, patch);
  if (patch.seo) config.seo = { ...(isRecord(config.seo) ? config.seo : {}), ...patch.seo };
  config.fotos = {
    hero: publicUrls[0]?.url,
    galeria: publicUrls.slice(1).map((x) => x.url),
  };

  // 4) Publica.
  const { error: siteErr } = await db.from("sites").upsert(
    { slug, tipo, nome, lead_id: leadId, config, publicado: true },
    { onConflict: "slug" },
  );
  if (siteErr) throw httpError(502, `Falha ao publicar site: ${siteErr.message}`);
  await db.from("leads").update({ dados: { ...dados, siteSlug: slug } }).eq("id", leadId);

  return {
    slug,
    nome,
    siteUrl: `/site/${slug}`,
    hero: publicUrls[0]?.url ?? null,
    modelo,
    geradas: publicUrls.filter((x) => !x.real).length,
    reais: publicUrls.filter((x) => x.real).length,
  };
}

Deno.serve(async (req) => {
  try {
    requirePost(req);
    const user = await requireUser(req);
    const body = await readJson<GenerateBody>(req, 300_000);

    const action = asString(body.action, 40);
    const service = asString(body.serviceSlug, 60);
    const businessRef = asString(body.businessRef, 300);
    const requestRef = asString(body.requestRef, 150);
    const prompt = asString(body.prompt, 20_000);
    const lang = asString(body.lang, 10) || "pt";
    if (!action || !ACTIONS.has(action) || !service || !businessRef || !requestRef || !prompt) {
      throw httpError(400, "Informe action, serviceSlug, businessRef, requestRef e prompt");
    }

    const inputHash = await sha256Hex(
      JSON.stringify({ action, businessRef, service, prompt, context: body.context ?? null }),
    );
    const db = serviceClient();
    const reservation = await reserveAction(db, {
      userId: user.id,
      action,
      businessRef,
      service,
      inputHash,
      requestRef,
    });

    try {
      // generate_site não exige OpenRouter — a NVIDIA assume texto e imagem
      // quando a chave falta ou o provedor falha. Demais ações ainda exigem.
      const apiKey = action === "generate_site"
        ? await getSecret("OPENROUTER_API_KEY")
        : await requireSecret("OPENROUTER_API_KEY");
      const context = isRecord(body.context) ? body.context : {};

      // Só o prompt — a pessoa copia e usa na IA que quiser (grátis).
      if (action === "image_prompt") {
        const enhanced = await enhanceImagePrompt(prompt, context);
        await settleAction(db, user.id, requestRef, "completed");
        return json({ conteudo: enhanced, modelo: NVIDIA_TEXT_MODEL, creditosCobrados: reservation.cost });
      }

      // Site premium: publica linha em `sites` + assets no Storage e devolve
      // um card pro lead_outputs — a experiência real vive em /site/<slug>.
      if (action === "generate_site") {
        let site: Awaited<ReturnType<typeof publishPremiumSite>>;
        try {
          site = await publishPremiumSite(db, apiKey, businessRef, context);
        } catch (err) {
          await settleAction(db, user.id, requestRef, "refunded");
          throw err;
        }
        await settleAction(db, user.id, requestRef, "completed");
        return json({
          conteudo: siteCardHtml(site.slug, site.nome, site.hero),
          siteSlug: site.slug,
          siteUrl: site.siteUrl,
          imagensReais: site.reais,
          imagensGeradas: site.geradas,
          modelo: site.modelo,
          creditosCobrados: reservation.cost,
        });
      }

      const model = action === "generate_image" ? IMAGE_MODEL : TEXT_MODEL;

      // Imagem avulsa: o pedido do usuário vira prompt em inglês otimizado
      // com a identidade do estabelecimento embutida.
      const enhancedImagePrompt = action === "generate_image"
        ? await enhanceImagePrompt(prompt, context)
        : null;

      const userContent = action === "generate_image"
        ? enhancedImagePrompt!
        : body.context
          ? `${prompt}\n\nContexto do estabelecimento:\n${JSON.stringify(context)}`
          : prompt;

      // Cadeia de provedores: OpenRouter primeiro; NVIDIA como fallback
      // gratuito quando o principal falha (rede, 402, 5xx) ou não devolve imagem.
      const t0 = Date.now();
      let data: Record<string, unknown> | null = null;
      let modelo = model;
      const systemPrompt = systemPromptFor(action, lang);
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": optionalEnv("APP_URL") ?? "https://seekerai.digital",
          "X-Title": "SeekerAi",
        },
        body: JSON.stringify({
          model,
          modalities: action === "generate_image" ? ["image", "text"] : undefined,
          max_tokens: action === "lead_assist" ? 1200 : undefined,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
        // Sem timeout o OpenRouter pode segurar a conexão até o gateway cortar.
        // Site precisa de mais tempo: o HTML completo são milhares de tokens.
        signal: AbortSignal.timeout(60_000),
      }).catch(() => null);
      const orStatus = res?.status ?? 0;
      if (res?.ok) {
        data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      } else {
        console.error("[openrouter] falhou:", orStatus || "network");
      }

      // Fallback NVIDIA — texto (ou imagem dedicada quando o OR não entrega).
      if (action === "generate_image") {
        const orChoices = data && Array.isArray(data.choices) ? data.choices : [];
        const orMsg = isRecord(orChoices[0]) && isRecord(orChoices[0].message) ? orChoices[0].message : {};
        const orHasImage = Array.isArray(orMsg.images) && orMsg.images.length > 0;
        if (!orHasImage) {
          const img = await nvidiaImage(userContent);
          if (img) {
            await settleAction(db, user.id, requestRef, "completed");
            return json({
              imagens: [img],
              modelo: NVIDIA_IMAGE_MODEL,
              provedor: "nvidia",
              creditosCobrados: reservation.cost,
            });
          }
        }
      } else if (!data) {
        // Sem orçamento pra NVIDIA se o OpenRouter já comeu o tempo da function.
        const elapsed = Date.now() - t0;
        const nv = elapsed < 120_000
          ? await nvidiaChat(
            systemPrompt,
            userContent,
            action === "lead_assist" ? 1200 : undefined,
            120_000,
          )
          : null;
        if (nv) {
          data = nv;
          modelo = NVIDIA_TEXT_MODEL;
          console.log("[ai-generate] respondido via NVIDIA (fallback)");
        }
      }

      if (!data) {
        await settleAction(db, user.id, requestRef, "refunded");
        if (orStatus === 402) {
          throw httpError(503, "Geração de IA temporariamente indisponível");
        }
        throw httpError(502, "Provedor de IA indisponível no momento");
      }
      await settleAction(db, user.id, requestRef, "completed");

      const choices = Array.isArray(data.choices) ? data.choices : [];
      const message = isRecord(choices[0]) && isRecord(choices[0].message)
        ? choices[0].message
        : {};
      const images = Array.isArray(message.images)
        ? message.images
          .map((img) => (isRecord(img) && isRecord(img.image_url) ? img.image_url.url : null))
          .filter((u): u is string => typeof u === "string")
        : [];

      const conteudo = typeof message.content === "string" ? message.content : null;

      return json({
        conteudo,
        imagens: images.length > 0 ? images : undefined,
        modelo,
        creditosCobrados: reservation.cost,
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error("[ai-generate] erro:", err instanceof Error ? err.message : err);
      throw httpError(502, "Provedor de IA indisponível no momento");
    }
  } catch (err) {
    return fail(err);
  }
});
