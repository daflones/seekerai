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
// gpt-oss-20b: responde JSON direto em ~8s. GLM "flash" gasta ~140s em
// reasoning_content e estoura o budget de ~150s da function.
const NVIDIA_TEXT_MODEL = optionalEnv("NVIDIA_TEXT_MODEL") ?? "openai/gpt-oss-20b";
const NVIDIA_IMAGE_MODEL = optionalEnv("NVIDIA_IMAGE_MODEL") ?? "black-forest-labs/flux.2-klein-4b";
// Modelos de visão pra descrever fotos reais — gemini pago primeiro;
// free do OpenRouter cobre quando a conta está sem crédito.
const VISION_MODELS = (optionalEnv("VISION_MODEL")
  ?? "google/gemini-2.5-flash,google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free")
  .split(",").map((s) => s.trim()).filter(Boolean);

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
      // Raciocínio desligado/mínimo — resposta direta, latência menor.
      ...(NVIDIA_TEXT_MODEL.includes("glm") ? {
        reasoning_effort: "low",
        chat_template_kwargs: { clear_thinking: true, enable_thinking: false },
      } : NVIDIA_TEXT_MODEL.includes("gpt-oss") ? {
        reasoning_effort: "low",
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
async function nvidiaImage(prompt: string, errors?: string[]): Promise<string | null> {
  const key = await getSecret("NVIDIA_API_KEY");
  if (!key) { errors?.push("nvidia:sem-chave"); return null; }
  const res = await fetch(`https://ai.api.nvidia.com/v1/genai/${NVIDIA_IMAGE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      // flux.2-klein rejeita prompt > 800 chars (422) — corta com folga.
      prompt: prompt.slice(0, 790),
      width: 1024, height: 1024,
      cfg_scale: 1, samples: 1,
      seed: Math.floor(Math.random() * 2_147_483_647),
      steps: 4,
    }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!res?.ok) {
    const body = res ? (await res.text().catch(() => "")).slice(0, 160) : "";
    console.error("[nvidia] imagem falhou:", res?.status ?? "network", body);
    errors?.push(`nvidia:${res?.status ?? "network"}${body ? ` ${body.slice(0, 120)}` : ""}`);
    return null;
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
  const b64 = isRecord(artifacts[0]) ? asString(artifacts[0].base64, 8_000_000) : null;
  if (!b64) errors?.push("nvidia:sem-artifact");
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
    // GLM gasta tokens em reasoning_content — folga pra resposta não truncar.
    1500,
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
  errors?: string[],
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
    errors?.push(`openrouter:${res?.status ?? "network"}`);
  }
  return nvidiaImage(imagePrompt, errors);
}

const REF_DESCRIBE_PROMPT =
  "Describe this photo of a local business in 2-3 short sentences for an image-generation art director: " +
  "what kind of place it is, what's visible (interior, facade, products, people at work), " +
  "materials and color palette, lighting mood and overall style. " +
  "Do NOT mention business names or any visible text. Be concrete and visual. " +
  "End your reply with a line exactly like: COLORS: #rrggbb, #rrggbb, #rrggbb " +
  "(the 3 most dominant and representative colors of the photo, accent hues first).";

/**
 * Descreve uma foto real do estabelecimento (visão) pra servir de
 * referência visual nos prompts de gap-fill — OpenRouter → NVIDIA.
 */
async function describeReferenceImage(
  apiKey: string | null,
  imageUrl: string,
): Promise<string | null> {
  const content = [
    { type: "image_url", image_url: { url: imageUrl } },
    { type: "text", text: REF_DESCRIBE_PROMPT },
  ];
  const extract = (data: Record<string, unknown>): string | null => {
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const c = isRecord(choices[0]) && isRecord(choices[0].message)
      ? choices[0].message.content
      : null;
    return typeof c === "string" && c.trim().length > 15 ? c.trim() : null;
  };
  if (apiKey) {
    for (const model of VISION_MODELS) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": optionalEnv("APP_URL") ?? "https://seekerai.digital",
          "X-Title": "SeekerAi",
        },
        body: JSON.stringify({ model, max_tokens: 220, messages: [{ role: "user", content }] }),
        signal: AbortSignal.timeout(45_000),
      }).catch(() => null);
      if (!res?.ok) {
        console.error("[site-vision] openrouter falhou:", model, res?.status ?? "network");
        continue;
      }
      const out = extract((await res.json().catch(() => ({}))) as Record<string, unknown>);
      if (out) return out;
    }
  }
  return null;
}

// ---------- pipeline do site premium (/site/<slug>) ----------
// Em vez de um HTML blob em lead_outputs, generate_site publica uma linha
// em `sites` (SiteConfig) + assets em site-assets/<slug>/ — renderizado
// pelo React multi-tenant (barbearia dark / beleza editorial claro).

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "site";

/** Tema + paleta visual por categoria do negócio.
    O tipo escolhe o layout (barbearia dark / beleza editorial);
    a paleta troca as cores do tema editorial pra combinar com o nicho. */
function siteThemeFor(categoria: string | null): { tipo: "barbearia" | "beleza"; paleta: string } {
  const c = (categoria ?? "").toLowerCase();
  if (/barbearia|barber|barbeiro/.test(c)) return { tipo: "barbearia", paleta: "barbearia" };
  const paleta =
    /tatuagem|tattoo|piercing/.test(c) ? "tattoo"
    : /padaria|confeitaria|doceria|doce|bakery/.test(c) ? "padaria"
    : /pizzaria|restaurante|hamburgueria|lanchonete|churrascaria|sushi|cantina|comida|marmita/.test(c) ? "trattoria"
    : /cafeteria|café|coffee/.test(c) ? "cafe"
    : /dentista|clínica|clinica|medicina|fisioterapia|psicolog|farmácia|farmacia|laborat|odonto|saúde|saude/.test(c) ? "clinica"
    : /academia|crossfit|personal|pilates|yoga|luta|dança|danca|fitness|gym/.test(c) ? "studio"
    : /pet|veterinár/.test(c) ? "pet"
    : /flor|jardim|paisag/.test(c) ? "flora"
    : /estética automotiva|estetica automotiva|detalhamento|lava.*car|oficina|mecânic|mecanic/.test(c) ? "carbono"
    : /imobiliár|advocacia|advogad|contabil|escritório|escritorio|seguro/.test(c) ? "corporativo"
    : "beleza";
  return { tipo: "beleza", paleta };
}

/** hex "#rrggbb" → { h, s, l } pra escolher acentos a partir das fotos reais. */
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s, l };
}

/**
 * Extrai cores dominantes das descrições de visão das fotos reais e
 * escolhe a mais saturada como accent do site — o site sai com a cara
 * das imagens do Instagram/Maps do lugar, não da paleta genérica.
 */
function accentFromDescriptions(descriptions: string[]): { accent: string; accent2: string } | null {
  const hexes = [...descriptions.join(" ").matchAll(/#([0-9a-f]{6})\b/gi)]
    .map((m) => `#${m[1].toLowerCase()}`);
  const candidates = hexes
    .map((hex) => ({ hex, hsl: hexToHsl(hex) }))
    .filter((x): x is { hex: string; hsl: { h: number; s: number; l: number } } => Boolean(x.hsl))
    // Acento precisa ter cor (não cinza/preto/branco) e contraste ok.
    .filter((x) => x.hsl.s > 0.18 && x.hsl.l > 0.16 && x.hsl.l < 0.82)
    .sort((a, b) => b.hsl.s - a.hsl.s || Math.abs(a.hsl.l - 0.45) - Math.abs(b.hsl.l - 0.45));
  if (!candidates.length) return null;
  const accent = candidates[0].hex;
  const second = candidates.find((x) => Math.abs(x.hsl.h - candidates[0].hsl.h) > 24);
  return {
    accent,
    accent2: second?.hex ?? (() => {
      const { h, s, l } = candidates[0].hsl;
      const l2 = l < 0.5 ? Math.min(0.82, l + 0.24) : Math.max(0.2, l - 0.22);
      return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l2 * 100)}%)`;
    })(),
  };
}

interface NichoVocab {
  /** Rótulo do nicho — eyebrow da nav/logo. */
  rotulo: string;
  /** Frase em itálico do hero ("se cuidar e se amar"). */
  em: string;
  /** Linha de apresentação do negócio no hero. */
  desc: string;
  /** "o estúdio" | "a padaria" — "Role para conhecer …". */
  prep: string;
  /** Item extra do marquee. */
  marquee: string;
  /** Em itálico do CTA do footer ("se cuidar"). */
  ctaEm: string;
  /** JSON-LD @type. */
  schema: string;
}

/** Vocabulário por nicho — sem texto de salão de beleza em estúdio de
    tattoo. Tudo determinístico a partir da paleta/categoria. */
function nicheVocab(paleta: string, categoria: string | null): NichoVocab {
  const V: Record<string, NichoVocab> = {
    beleza: { rotulo: "ESPAÇO DE BELEZA", em: "se cuidar e se amar", desc: "beleza, cuidado e autoestima. Ambiente acolhedor e atendimento sem pressa.", prep: "o espaço", marquee: "Um lugar para você se cuidar", ctaEm: "se cuidar", schema: "BeautySalon" },
    tattoo: { rotulo: "ESTÚDIO DE TATUAGEM", em: "marcar a sua história", desc: "tatuagens autorais e piercings. Ambiente criativo, atendimento sem pressa e arte de verdade.", prep: "o estúdio", marquee: "Arte que fica na pele", ctaEm: "se expressar", schema: "TattooParlor" },
    padaria: { rotulo: "PADARIA ARTESANAL", em: "saborear o pão do dia", desc: "pães fresquinhos, cafés e doces da casa. Cheiro de fornada e aquele atendimento de bairro.", prep: "a padaria", marquee: "Saindo do forno, todo dia", ctaEm: "saborear", schema: "Bakery" },
    trattoria: { rotulo: "RESTAURANTE", em: "viver a boa mesa", desc: "pratos da casa feitos com carinho. Ambiente acolhedor pra comer bem e ficar à vontade.", prep: "a casa", marquee: "Mesa posta, coração aberto", ctaEm: "saborear", schema: "Restaurant" },
    cafe: { rotulo: "CAFÉ ESPECIAL", em: "viver o ritual do café", desc: "cafés especiais, métodos e lanches da casa. Um cantinho pra desacelerar.", prep: "o café", marquee: "Café passado na hora", ctaEm: "desacelerar", schema: "CafeOrCoffeeShop" },
    clinica: { rotulo: "CLÍNICA", em: "cuidar da sua saúde", desc: "atendimento humanizado e cuidado completo. Estrutura pensada pra você se sentir bem.", prep: "a clínica", marquee: "Cuidado de verdade", ctaEm: "se cuidar", schema: "MedicalClinic" },
    studio: { rotulo: "STUDIO FITNESS", em: "evoluir todo dia", desc: "treino, técnica e constância. Energia pra você sair melhor do que entrou.", prep: "o estúdio", marquee: "Seu melhor treino te espera", ctaEm: "evoluir", schema: "ExerciseGym" },
    pet: { rotulo: "PETSHOP", em: "cuidar de quem te ama", desc: "banho, tosa e cuidado completo pro seu melhor amigo. Carinho em cada detalhe.", prep: "o espaço", marquee: "Pet feliz, dono tranquilo", ctaEm: "cuidar deles", schema: "PetStore" },
    flora: { rotulo: "FLORICULTURA", em: "florescer o seu dia", desc: "arranjos autorais e flores fresquinhas. Delicadeza pra qualquer momento.", prep: "o ateliê", marquee: "Flores frescas, todo dia", ctaEm: "florescer", schema: "Florist" },
    carbono: { rotulo: "ESTÉTICA AUTOMOTIVA", em: "brilhar de novo", desc: "detalhamento, proteção e acabamento de precisão. Seu carro tratado como merece.", prep: "o estúdio", marquee: "Detalhe que faz diferença", ctaEm: "renovar", schema: "AutoBodyShop" },
    corporativo: { rotulo: "ESPAÇO PROFISSIONAL", em: "resolver com confiança", desc: "atendimento especializado e soluções sob medida. Seriedade com atenção de verdade.", prep: "o escritório", marquee: "Confiança em cada detalhe", ctaEm: "resolver", schema: "ProfessionalService" },
  };
  const base = V[paleta] ?? {
    rotulo: (categoria ?? "ESTABELECIMENTO LOCAL").toUpperCase(),
    em: "se sentir em casa",
    desc: `${(categoria ?? "atendimento").toLowerCase()} e atendimento de verdade. Ambiente acolhedor, sem pressa.`,
    prep: "o espaço", marquee: "Um lugar pra você", ctaEm: "se cuidar", schema: "LocalBusiness",
  };
  return base;
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

/** Baixa um vídeo remoto → bytes (cap 70MB — reels chegam perto de 50MB), ou null. */
async function fetchVideoBytes(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) }).catch(() => null);
  if (!res?.ok) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > 70_000_000) return null;
  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "video/mp4";
  if (!contentType.startsWith("video/")) return null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType };
}

const APIFY_PLACES_ACTOR = (optionalEnv("APIFY_PLACES_ACTOR") ?? "compass/crawler-google-places").replace("/", "~");
const APIFY_IG_ACTOR = (optionalEnv("APIFY_IG_ACTOR") ?? "apify/instagram-scraper").replace("/", "~");

interface PlaceReview { autor: string; nota: number; texto: string; quando?: string }
interface PlaceDetails {
  reviews: PlaceReview[];
  imageUrls: string[];
  instagram?: string;
  horarios?: Record<string, [string, string][] | null>;
  horariosLabel?: [string, string][];
  avaliacao?: number;
  totalAvaliacoes?: number;
}

const DAY_KEY: Record<string, string> = {
  monday: "1", tuesday: "2", wednesday: "3", thursday: "4", friday: "5", saturday: "6", sunday: "0",
  "segunda-feira": "1", "terça-feira": "2", "quarta-feira": "3",
  "quinta-feira": "4", "sexta-feira": "5", "sábado": "6", "domingo": "0",
};
const DAY_PT: Record<string, string> = {
  "1": "Segunda", "2": "Terça", "3": "Quarta", "4": "Quinta", "5": "Sexta", "6": "Sábado", "0": "Domingo",
};

/** "9:00 AM to 7:00 PM" / "05:00 to 21:00" (e múltiplas janelas) → [["09:00","19:00"], ...]. */
function parseOpeningHours(hours: string): [string, string][] | null {
  if (/closed|fechado/i.test(hours)) return null;
  if (/24\s*(hours|horas)/i.test(hours)) return [["00:00", "23:59"]];
  const to24 = (h: string, m: string, ap: string | undefined) => {
    let hh = Number(h);
    if (ap?.toUpperCase() === "PM" && hh < 12) hh += 12;
    if (ap?.toUpperCase() === "AM" && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:${m}`;
  };
  const out: [string, string][] = [];
  const re = /(\d{1,2}):(\d{2})\s*([AP]M)?\s*(?:to|às|a)\s*(\d{1,2}):(\d{2})\s*([AP]M)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(hours))) out.push([to24(m[1], m[2], m[3]), to24(m[4], m[5], m[6])]);
  return out.length ? out : null;
}

/**
 * Avaliações + horários reais do Maps via Apify — o scraper da busca
 * roda com maxReviews: 0, então aqui fazemos uma chamada mirada só
 * quando o site está sendo gerado (até 6 reviews).
 */
async function fetchPlaceDetails(lead: Record<string, unknown>): Promise<PlaceDetails> {
  const empty: PlaceDetails = { reviews: [], imageUrls: [] };
  const token = await getSecret("APIFY_API_TOKEN");
  if (!token) return empty;
  const nome = asString(lead.nome, 150) ?? "";
  const cidade = [asString(lead.cidade, 80), asString(lead.uf, 4)].filter(Boolean).join(" ");
  // reviewsSort liga o scrape de reviews; placeIds é match exato quando o
  // lead guardou o placeId real do Google (ChIJ...). Social/contatos ficam
  // fora daqui — é crawl pesado que derruba a chamada inteira.
  const placeId = asString(lead.place_id, 300);
  const body = {
    ...(placeId?.startsWith("ChIJ") ? { placeIds: [placeId] }
      : { searchStringsArray: [`${nome} ${cidade}`.trim()] }),
    maxCrawledPlacesPerSearch: 1,
    maxReviews: 6,
    reviewsSort: "newest",
    maxImages: 10,
    language: "pt-BR",
  };
  const res = await fetch(
    `https://api.apify.com/v2/actors/${APIFY_PLACES_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=55`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(70_000) },
  ).catch(() => null);
  if (!res?.ok) {
    console.error("[site] apify reviews falhou:", res?.status ?? "network");
    return empty;
  }
  const items = (await res.json().catch(() => [])) as unknown[];
  const place = isRecord(items[0]) ? items[0] : {};
  // Fotos reais do Maps além da capa — galeria enriquecida com mídia do local.
  const imageUrls = (Array.isArray(place.imageUrls) ? place.imageUrls : [])
    .map((u) => asString(u, 800)).filter((u): u is string => Boolean(u)).slice(0, 6);

  // Instagram do lugar via scrapeSocialMediaProfiles — chamada à parte e
  // só quando o lead não tem @, porque esse crawl visita o site do lugar
  // (lento) e não pode derrubar a chamada de reviews.
  const instagramFromPlace = (p: Record<string, unknown>): string | undefined => {
    const bags = [
      ...(Array.isArray(p.instagrams) ? p.instagrams : []),
      p.instagram, p.instagramUrl, p.website,
    ];
    for (const raw of bags) {
      const match = asString(raw, 500)?.match(/instagram\.com\/(?:p\/)?([A-Za-z0-9._%]+)/i);
      if (match) return `@${match[1]}`;
    }
    return undefined;
  };
  const instagram = instagramFromPlace(place);
  const reviews = (Array.isArray(place.reviews) ? place.reviews : [])
    .slice(0, 6).flatMap((r): PlaceReview[] => {
      if (!isRecord(r)) return [];
      const texto = asString(r.text ?? r.reviewText, 500);
      const autor = asString(r.name ?? r.reviewerName, 80) ?? "Cliente";
      if (!texto || texto.length < 12) return [];
      return [{
        autor,
        nota: typeof r.stars === "number" ? r.stars : 5,
        texto,
        quando: asString(r.publishAt ?? r.publishedAtDate ?? r.reviewPublishedDate, 40),
      }];
    });

  // Horários reais do Maps → horarios/horariosLabel determinísticos.
  const horarios: Record<string, [string, string][] | null> = {};
  const byDay = new Map<string, [string, string]>();
  for (const d of Array.isArray(place.openingHours) ? place.openingHours : []) {
    if (!isRecord(d)) continue;
    const key = DAY_KEY[(asString(d.day, 20) ?? "").toLowerCase()];
    if (!key) continue;
    const windows = parseOpeningHours(asString(d.hours, 160) ?? "");
    horarios[key] = windows;
    byDay.set(key, [DAY_PT[key], windows ? windows.map((w) => `${w[0]} – ${w[1]}`).join(", ") : "Fechado"]);
  }
  const horariosLabel = ["1", "2", "3", "4", "5", "6", "0"].flatMap((k) => byDay.get(k) ? [byDay.get(k)!] : []);
  return {
    reviews, imageUrls, instagram,
    ...(horariosLabel.length ? { horarios, horariosLabel } : {}),
    avaliacao: typeof place.totalScore === "number" ? place.totalScore : undefined,
    totalAvaliacoes: typeof place.reviewsCount === "number" ? place.reviewsCount : undefined,
  };
}

/**
 * Descoberta pesada de Instagram: scrapeSocialMediaProfiles visita o site
 * do estabelecimento. Roda à parte — se demorar, não sacrifica reviews.
 */
async function fetchPlaceInstagram(lead: Record<string, unknown>): Promise<string | null> {
  const token = await getSecret("APIFY_API_TOKEN");
  if (!token) return null;
  const nome = asString(lead.nome, 150) ?? "";
  const cidade = [asString(lead.cidade, 80), asString(lead.uf, 4)].filter(Boolean).join(" ");
  const placeId = asString(lead.place_id, 300);
  const res = await fetch(
    `https://api.apify.com/v2/actors/${APIFY_PLACES_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=85`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(placeId?.startsWith("ChIJ") ? { placeIds: [placeId] }
          : { searchStringsArray: [`${nome} ${cidade}`.trim()] }),
        maxCrawledPlacesPerSearch: 1,
        scrapeSocialMediaProfiles: {
          facebooks: false, instagrams: true, youtubes: false, tiktoks: false,
          twitters: false, linkedins: false, pinterests: false, discords: false,
          githubs: false, patreons: false, telegrams: false, mediums: false,
          spotifys: false, threads: false,
        },
        maxReviews: 0,
        language: "pt-BR",
      }),
      signal: AbortSignal.timeout(100_000),
    },
  ).catch(() => null);
  if (!res?.ok) return null;
  const items = (await res.json().catch(() => [])) as unknown[];
  const p = isRecord(items[0]) ? items[0] : {};
  const bags = [...(Array.isArray(p.instagrams) ? p.instagrams : []), p.instagram, p.instagramUrl, p.website];
  for (const raw of bags) {
    const match = asString(raw, 500)?.match(/instagram\.com\/(?:p\/)?([A-Za-z0-9._%]+)/i);
    if (match) return `@${match[1]}`;
  }
  return null;
}

interface IgMedia {
  images: string[];
  videos: { src: string; titulo: string }[];
  captions: string[];
  profilePic?: string;
  bio?: string;
  erro?: string;
}

/**
 * Scraper de Instagram via Apify — pega posts do @ do lead:
 * imagens (displayUrl/sidecar), vídeos (videoUrl/reels) e legendas.
 * As legendas viram contexto pra IA (serviços/diferenciais reais) e
 * a mídia real re-hospedada popula galeria e reels do site.
 */
async function fetchInstagramMedia(handleOrUrl: string | null | undefined): Promise<IgMedia | null> {
  const token = await getSecret("APIFY_API_TOKEN");
  const raw = handleOrUrl;
  if (!token || !raw) return null;
  const handle = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1] ?? raw.replace(/^@/, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9._]{1,60}$/.test(handle)) return null;
  const res = await fetch(
    `https://api.apify.com/v2/actors/${APIFY_IG_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=80`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: "posts",
        resultsLimit: 12,
      }),
      signal: AbortSignal.timeout(95_000),
    },
  ).catch(() => null);
  if (!res?.ok) {
    console.error("[site] apify instagram falhou:", res?.status ?? "network");
    return { images: [], videos: [], captions: [], erro: `http:${res?.status ?? "network"}` };
  }
  const items = (await res.json().catch(() => [])) as unknown[];
  const media: IgMedia = { images: [], videos: [], captions: [] };
  if (!Array.isArray(items) || !items.length) media.erro = "vazio";
  for (const item of items) {
    if (!isRecord(item)) continue;
    const caption = asString(item.caption, 600);
    if (caption) media.captions.push(caption);
    const type = asString(item.type, 40);
    if (type === "Video" || asString(item.isVideo) === "true") {
      const videoUrl = asString(item.videoUrl, 1200);
      if (videoUrl) {
        media.videos.push({ src: videoUrl, titulo: caption?.split("\n")[0]?.slice(0, 80) || "Reel" });
      }
    }
    const pushImg = (v: unknown) => {
      const u = asString(v, 1200);
      if (u && u.startsWith("http")) media.images.push(u);
    };
    // Sidecar traz filhos em campos diferentes conforme a versão do actor.
    const children = [item.images, item.childPosts, item.sidecarImages].filter(Array.isArray)[0] as unknown[] | undefined;
    if (children?.length) for (const c of children) pushImg(isRecord(c) ? c.displayUrl ?? c.url : c);
    else pushImg(item.displayUrl ?? item.imageUrl);
  }
  media.images = media.images.slice(0, 8);
  media.videos = media.videos.slice(0, 2);
  media.captions = media.captions.slice(0, 10);
  if (!media.images.length && !media.videos.length && !media.erro) media.erro = "sem-midia";
  return media;
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
  visualRef?: string | null,
): string[] {
  // Sem o nome literal do negócio e com categoria em inglês: modelos de
  // imagem renderizam palavras do prompt como letreiro/embalagem na foto.
  const CAT_EN: Record<string, string> = {
    padaria: "bakery", barbearia: "barbershop", restaurante: "restaurant",
    pizzaria: "pizzeria", "salão de beleza": "beauty salon", "salao de beleza": "beauty salon",
    academia: "fitness gym", "clínica de estética": "aesthetics clinic", "clinica de estetica": "aesthetics clinic",
    "loja de roupas": "clothing store", farmácia: "pharmacy", farmacia: "pharmacy",
    "oficina mecânica": "auto repair shop", "oficina mecanica": "auto repair shop",
    petshop: "pet shop", "pet shop": "pet shop", confeitaria: "patisserie",
    café: "specialty coffee shop", cafeteria: "specialty coffee shop",
    "estúdio de tatuagem": "tattoo studio", floricultura: "flower shop",
    "consultório odontológico": "dental clinic", hamburgueria: "burger restaurant",
    "açaí": "açaí bowl shop", sushi: "sushi restaurant", churrascaria: "brazilian steakhouse",
    "estética automotiva": "car detailing studio", lavanderia: "laundromat",
  };
  const catKey = (lead.categoria ?? "").toLowerCase().trim();
  const catEn = CAT_EN[catKey] ?? CAT_EN[catKey.replace(/\s*-\s*.*/, "")] ?? lead.categoria ?? "local business";
  // Nem nome nem cidade no texto do prompt: qualquer substantivo próprio
  // vira letreiro/marca d'água na imagem gerada.
  const biz = `a Brazilian ${catEn}`;
  const DIRECTIONS: Record<string, string> = {
    barbearia: "dark moody cinematic look, charcoal and amber tones, brass and leather textures, shallow depth of field",
    beleza: "bright editorial look, ivory and champagne tones, soft window light, delicate gold accents, shallow depth of field",
    padaria: "warm rustic bakery look, cream and terracotta tones, morning light through the window, wood and linen textures, dust of flour",
    trattoria: "rich appetizing restaurant look, warm low light, deep red and dark wood tones, rustic table settings",
    cafe: "cozy artisanal coffee shop look, warm brown and cream tones, soft morning light, ceramic and wood textures",
    clinica: "clean clinical look, airy white and soft teal tones, bright diffuse light, minimal hygienic surfaces",
    studio: "moody athletic look, dark graphite tones with energetic accents, dramatic rim lighting, dynamic feel",
    pet: "friendly warm look, soft green and cream tones, natural daylight, cozy caring atmosphere",
    flora: "romantic botanical look, blush pink and sage tones, soft daylight, delicate floral textures",
    corporativo: "sophisticated professional look, navy and warm grey tones, clean office light, polished surfaces",
    tattoo: "moody tattoo studio look, near-black tones with crimson accents, ink and skin textures, dramatic spotlighting",
    carbono: "sleek automotive detailing look, graphite and amber tones, glossy reflections, dramatic garage lighting",
  };
  const direction = DIRECTIONS[tipo] ?? DIRECTIONS.beleza;
  const scenes = [
    `wide establishing shot of the interior of ${biz}, hero image, clear focal point`,
    `interior detail of ${biz} — the client chair or service station and ambient decor`,
    `close-up of the signature work at ${biz} — tools and craft in action, hands only`,
    `a finished result from ${biz} presented like a portfolio photograph`,
    `flat-lay of the products and materials used at ${biz}, generous negative space`,
  ];
  // Descrição das fotos reais do lugar (visão) — o gerado deve parecer
  // com o estabelecimento de verdade, não com um negócio genérico.
  // FLUX.2-klein limita prompt em 800 chars — regra "sem texto" vai na
  // frente pra nunca ser cortada pelo slice de segurança.
  const ref = visualRef
    ? ` Match the real place: ${visualRef.slice(0, 320)}`
    : "";
  return scenes.map((scene) =>
    "Strictly no readable text, letters, numbers, signage, logos or watermark anywhere. No visible faces. " +
    `Editorial commercial photograph: ${scene}, ${direction}.${ref} ` +
    "Photorealistic, 50mm lens, color-graded, high dynamic range."
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
  '  "faq":[{"q":"…","a":"…"}], "seo":{"description":"…"} }',
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
  extraFacts?: string,
): Promise<{ patch: Record<string, unknown>; modelo: string }> {
  const facts = {
    nome: lead.nome, categoria: lead.categoria, cidade: lead.cidade, uf: lead.uf,
    endereco: lead.endereco, avaliacao: lead.avaliacao, totalAvaliacoes: lead.total_avaliacoes,
    instagram: lead.instagram, temWhatsApp: lead.whatsapp === "sim",
  };
  const userContent = `Estabelecimento:\n${JSON.stringify(facts)}${extraFacts ?? ""}`;

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
    // Uma falha transitória não deve derrubar o patch — uma retentativa.
    for (let t = 0; t < 2; t++) {
      const nv = await nvidiaChat(CONFIG_PATCH_SYSTEM, userContent, 3000, 60_000);
      const nvChoices = nv && Array.isArray(nv.choices) ? nv.choices : [];
      const nvContent = isRecord(nvChoices[0]) && isRecord(nvChoices[0].message)
        ? nvChoices[0].message.content : null;
      if (typeof nvContent === "string" && nvContent.trim()) {
        content = nvContent;
        modelo = NVIDIA_TEXT_MODEL;
        console.log("[site-config] respondido via NVIDIA (fallback)");
        break;
      }
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
): Promise<{ slug: string; nome: string; siteUrl: string; hero: string | null; modelo: string; geradas: number; reais: number; imagemErros: string[]; debug: Record<string, unknown> }> {
  const { data: lead } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) throw httpError(404, "Lead não encontrado");

  const dados = isRecord(lead.dados) ? lead.dados : {};
  const nome = asString(lead.nome, 150) ?? "estabelecimento";
  const { tipo, paleta } = siteThemeFor(asString(lead.categoria, 150));

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

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Scrapes secundários em paralelo — Apify demora e o gateway corta em
  // ~150s, então cada consumidor faz race com um cap próprio.
  const placePromise = fetchPlaceDetails(lead);
  // Instagram: o @ do lead (vem do Maps) dispara o scrape já; sem @, tenta
  // o website do place e, por último, a descoberta social (crawl pesado).
  const igPromise = (async () => {
    let handle = asString(lead.instagram, 300) ?? null;
    if (!handle) {
      const place = await placePromise;
      handle = place.instagram ?? (await fetchPlaceInstagram(lead));
      if (handle) {
        await db.from("leads").update({ instagram: handle }).eq("id", leadId).is("instagram", null);
      }
    }
    return handle ? fetchInstagramMedia(handle) : null;
  })();

  // Patch de config roda EM PARALELO com as imagens — são independentes.
  // Espera o Instagram até 35s só pra capturar as legendas como contexto.
  const patchPromise = (async () => {
    const ig = await Promise.race([igPromise, sleep(35_000).then(() => null)]);
    const captions = ig?.captions?.slice(0, 8).join("\n---\n") ?? "";
    // Métricas/bio raspadas na busca e salvas no lead enriquecem o contexto.
    const igMeta = (lead.dados as Record<string, unknown> | null)?.ig as
      { bio?: string | null; seguidores?: number | null; posts?: number | null } | undefined;
    const facts: string[] = [];
    if (igMeta?.bio) facts.push(`Bio do Instagram: ${asString(igMeta.bio, 400)}`);
    if (igMeta?.seguidores) facts.push(`Seguidores no Instagram: ${igMeta.seguidores} (${igMeta.posts ?? 0} posts)`);
    const extra = [
      facts.length ? `Dados reais do Instagram:\n${facts.join("\n")}` : "",
      captions ? `Legendas reais do Instagram do estabelecimento (use pra inferir serviços, diferenciais e o tom da marca — nunca cite nomes de clientes):\n${captions}` : "",
    ].filter(Boolean).join("\n\n");
    return configPatchFromAi(apiKey, lead, extra ? `\n${extra}` : "");
  })();

  // 1) Imagens reais: baixa e re-hospeda (URLs do Google/Apify expiram).
  const sources = await resolveLeadImageSources(lead, context);
  // Instagram é bonus — não pode segurar o pipeline. Com @ no lead o
  // scrape é direto; sem @ a descoberta social pode demorar mais.
  const igCap = lead.instagram ? 60_000 : 125_000;
  const ig = await Promise.race([igPromise, sleep(igCap).then(() => null)]);
  if (ig) {
    for (const u of ig.images) {
      if (sources.length < MAX_SITE_IMAGES && !sources.includes(u)) sources.push(u);
    }
  }
  // Foto de perfil do Instagram (raspada na busca) — logo/fachada real.
  const igFoto = ((lead.dados as Record<string, unknown> | null)?.ig as
    { foto?: string | null } | undefined)?.foto;
  if (igFoto && sources.length < MAX_SITE_IMAGES && !sources.includes(igFoto)) {
    sources.push(igFoto);
  }
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

  // Descreve até 2 fotos reais (Maps/Instagram) — serve pra (a) dar
  // referência visual ao gap-fill e (b) extrair as cores dominantes do
  // lugar de verdade, que viram o accent do site.
  const refs = await Promise.all(
    publicUrls.slice(0, 2).map((x) => describeReferenceImage(apiKey, x.url)),
  );
  const descs = refs.filter((d): d is string => Boolean(d));
  const cores = accentFromDescriptions(descs);

  // 2) Gap-fill com IA — prompt específico por slot, direção de arte do tema.
  const imgErrors: string[] = [];
  const faltando = Math.min(SITE_IMAGE_TARGET - publicUrls.length, MAX_GENERATED_IMAGES);
  if (faltando > 0) {
    const visualRef = descs.join(" ").slice(0, 700).trim() || null;

    const prompts = siteAssetPrompts(
      { nome, categoria: asString(lead.categoria, 150), cidade: asString(lead.cidade, 80) },
      tipo === "barbearia" ? "barbearia" : paleta, visualRef,
    ).slice(0, faltando);
    const generated = await Promise.all(prompts.map((p) => generateSiteImage(apiKey, p, imgErrors)));
    // Uma segunda chance pras que falharem — provedores falham intermitente.
    await Promise.all(generated.map(async (img, i) => {
      if (img === null) generated[i] = await generateSiteImage(apiKey, prompts[i], imgErrors);
    }));
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
  // Em paralelo: re-hospeda vídeos do Instagram e espera as avaliações
  // do Maps (antes só nota/total — agora com autor e texto).
  const igVideoPromise = (async () => {
    // Reels chegam a ~50MB — sequencial pra não estourar a memória do edge.
    const out: { src: string; titulo: string }[] = [];
    let idx = 0;
    for (const v of ig?.videos ?? []) {
      const dl = await fetchVideoBytes(v.src);
      if (!dl) continue;
      const ext = dl.contentType.includes("webm") ? "webm" : "mp4";
      const url = await uploadSiteAsset(db, slug, `video-${++idx}.${ext}`, dl.bytes, dl.contentType);
      if (url) out.push({ src: url, titulo: v.titulo });
    }
    return out;
  })();
  const [videos, place] = await Promise.all([
    igVideoPromise,
    Promise.race([placePromise, sleep(45_000).then(() => ({ reviews: [], imageUrls: [] } as PlaceDetails))]),
  ]);

  // Fotos do Maps re-hospedadas — URLs do Google expiram, então
  // copiamos pro Storage como o resto das imagens reais.
  const placeImgs = (await Promise.all(place.imageUrls.slice(0, 4).map(async (u, i) => {
    const dl = await fetchImageBytes(u);
    if (!dl) return null;
    const ext = dl.contentType.includes("png") ? "png" : dl.contentType.includes("webp") ? "webp" : "jpg";
    return uploadSiteAsset(db, slug, `maps-${i + 1}.${ext}`, dl.bytes, dl.contentType);
  }))).filter((u): u is string => Boolean(u));

  const config = baseSiteConfig(lead, tipo);
  const { patch, modelo } = await patchPromise;
  Object.assign(config, patch);
  if (patch.seo) config.seo = { ...(isRecord(config.seo) ? config.seo : {}), ...patch.seo };
  const realPhotos = publicUrls.filter((x) => x.real).map((x) => x.url);
  const genPhotos = publicUrls.filter((x) => !x.real).map((x) => x.url);
  config.fotos = {
    hero: realPhotos[0] ?? genPhotos[0],
    galeria: [...realPhotos.slice(1), ...placeImgs, ...genPhotos],
  };
  // Tema: paleta do nicho + variante de layout (3 composições — sites
  // não ficam clones) + cores extraídas das fotos reais do lugar.
  const variants = ["a", "b", "c"] as const;
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  config.tema = { paleta, variant: variants[h % 3], ...(cores ? { cores } : {}) };
  config.vocab = nicheVocab(paleta, asString(lead.categoria, 150));
  // Fatos reais vencem o patch — horários e avaliações vêm do Maps,
  // e o Instagram descoberto completa o contato.
  if (place.instagram && isRecord(config.contato) && !config.contato.instagram) {
    config.contato.instagram = `https://instagram.com/${place.instagram.replace(/^@/, "")}`;
  }
  if (place.horarios) config.horarios = place.horarios;
  if (place.horariosLabel) config.horariosLabel = place.horariosLabel;
  if (videos.length) config.videos = videos;
  // Nota/reviews do Maps também preenchem o que o lead não tinha (ex.:
  // lead criado a mão sem avaliação — o chip e as avaliações somem sem isso).
  if (!isRecord(config.avaliacoes) && place.avaliacao) {
    config.avaliacoes = { nota: place.avaliacao, total: place.totalAvaliacoes ?? 0, fonte: "Google" };
  }
  if (place.reviews.length && isRecord(config.avaliacoes)) {
    (config.avaliacoes as Record<string, unknown>).itens = place.reviews;
  }

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
    imagemErros: imgErrors.slice(0, 8),
    debug: {
      ig: ig ? { imgs: ig.images.length, vids: ig.videos.length, erro: ig.erro ?? null } : "sem-instagram/timeout",
      videosRehosted: videos.length,
      place: { reviews: place.reviews.length, imgs: placeImgs.length, horarios: place.horariosLabel?.length ?? 0, instagram: place.instagram ?? null },
      sources: sources.length,
    },
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
          imagemErros: site.imagemErros,
          debug: site.debug,
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
