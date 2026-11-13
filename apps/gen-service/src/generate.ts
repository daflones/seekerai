// Geração com IA via OpenRouter — deep_strategy, sales_reply, generate_site,
// generate_image. Se o OpenRouter falhar, cai para a NVIDIA (build.nvidia.com)
// como fallback gratuito — texto via chat/completions e imagem via genai.
// Chaves ficam como secrets do Supabase; consome créditos.
//
// generate_site é um pipeline: usa imagens reais do contexto (Serper/ScrapeCreators)
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
} from "./common.ts";
import { getSecret } from "./secrets.ts";
import { igMediaCached, igProfileCached } from "./instagram.ts";
import { notifyError, NotifyErrorInput } from "./notify.ts";
import { callingCodeFor, toE164 } from "./phone.ts";
import { emitJobEvent } from "./bus.ts";

const ACTIONS = new Set([
  "deep_strategy",
  "sales_reply",
  "generate_site",
  "generate_image",
  "lead_assist",
  "image_prompt",
  "generate_app",
  "editor_assist",
  "enhance_reply",
]);

const TEXT_MODEL = optionalEnv("AI_TEXT_MODEL") ?? "openai/gpt-4o-mini";
const IMAGE_MODEL = optionalEnv("AI_IMAGE_MODEL") ?? "google/gemini-2.5-flash-image";
// Geração de site/app: 4.1-mini escreve páginas completas (~30KB/7 seções);
// o 4o-mini entregava esqueleto de ~5KB. Custo ~5x mas ainda centavos.
const SITE_MODEL = optionalEnv("AI_SITE_MODEL") ?? "openai/gpt-4.1-mini";
const MAX_SITE_IMAGES = 8;
// Alvo de mídia do site premium: 1 hero + galeria p/ corredor 3D e masonry.
// O que o lead não tiver de imagem real a IA gera (até o teto abaixo).
const SITE_IMAGE_TARGET = 6;
const MAX_GENERATED_IMAGES = 5;

// Fallback NVIDIA (build.nvidia.com) — gratuito, OpenAI-compatible.
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
// gpt-oss-20b: responde JSON direto em ~8s. GLM "flash" gasta ~140s em
// reasoning_content e estoura o budget de ~150s da function.
const NVIDIA_TEXT_MODEL = optionalEnv("NVIDIA_TEXT_MODEL") ?? "meta/llama-3.2-90b-vision-instruct";
const NVIDIA_IMAGE_MODEL = optionalEnv("NVIDIA_IMAGE_MODEL") ?? "black-forest-labs/flux.2-klein-4b";
// Modelos de visão pra descrever fotos reais — gemma ":free" primeiro
// (custo zero), gemini pago só quando os gratuitos não respondem.
const VISION_MODELS = (optionalEnv("VISION_MODEL")
  ?? "google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free,google/gemini-2.5-flash")
  .split(",").map((s) => s.trim()).filter(Boolean);
// Groq (api.groq.com) — gratuito, OpenAI-compatible, latência baixa.
const GROQ_TEXT_MODEL = optionalEnv("GROQ_TEXT_MODEL") ?? "openai/gpt-oss-120b";
// Modelo ":free" do próprio OpenRouter — não consome crédito pago e
// responde rápido (~10s). Rede de segurança quando a NVIDIA está fora.
const OR_FREE_TEXT_MODEL = optionalEnv("OR_FREE_TEXT_MODEL") ?? "nvidia/nemotron-3-ultra-550b-a55b:free";
// Modelos ":free" tentados em ordem na geração de app/site quando o
// modelo pago falha (402, rede, 5xx) — preferência a modelos bons de
// código. Override por secret, separados por vírgula.
const OR_FREE_APP_MODELS = (optionalEnv("OR_FREE_APP_MODELS")
  ?? "nvidia/nemotron-3-ultra-550b-a55b:free,qwen/qwen3-coder:free,meta-llama/llama-3.3-70b-instruct:free")
  .split(",").map((s) => s.trim()).filter(Boolean);
// Modelo ":free" com visão — usado quando a ação recebe imagens de
// verdade (editor_assist com fotos anexadas). Override por secret.
const OR_FREE_VISION_MODEL = optionalEnv("OR_FREE_VISION_MODEL") ?? "google/gemma-4-26b-a4b-it:free";
// Patch de config do site (copy + serviços + FAQ + SEO) — JSON estruturado
// de ~2.5k tokens; 4o-mini resolve pela metade do custo do 4.1-mini.
const PATCH_MODEL = optionalEnv("AI_PATCH_MODEL") ?? "openai/gpt-4o-mini";

// Circuit breaker: a conta free da NVIDIA derruba modelos sem aviso
// (404/410) e os que aceitam a requisição travam até o timeout — sem o
// breaker cada chamada queimava ~120s antes de morrer. Falhou, fica
// fora do ar por 3min por instância.
let nvidiaDownUntil = 0;

/** Chat de texto na NVIDIA — mesmo formato OpenAI. Retorna o JSON ou null. */
async function nvidiaChat(
  system: string,
  userContent: string,
  maxTokens?: number,
  timeoutMs?: number,
  model?: string,
): Promise<Record<string, unknown> | null> {
  if (Date.now() < nvidiaDownUntil) return null;
  const key = await getSecret("NVIDIA_API_KEY");
  if (!key) return null;
  const useModel = model ?? NVIDIA_TEXT_MODEL;
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: useModel,
      stream: false,
      max_tokens: maxTokens ?? 4096,
      // Raciocínio desligado/mínimo — resposta direta, latência menor.
      ...(useModel.includes("glm") ? {
        reasoning_effort: "low",
        chat_template_kwargs: { clear_thinking: true, enable_thinking: false },
      } : useModel.includes("gpt-oss") ? {
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
    nvidiaDownUntil = Date.now() + 3 * 60_000;
    return null;
  }
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/** Chat de texto no Groq — mesmo formato OpenAI. Retorna o JSON ou null. */
async function groqChat(
  system: string,
  userContent: string,
  maxTokens?: number,
  timeoutMs?: number,
): Promise<Record<string, unknown> | null> {
  const key = await getSecret("GROQ_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_TEXT_MODEL,
      stream: false,
      max_tokens: maxTokens ?? 1024,
      ...(GROQ_TEXT_MODEL.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs ?? 45_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.error("[groq] chat falhou:", res?.status ?? "network");
    return null;
  }
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/**
 * Chat via modelo ":free" do OpenRouter — usa a mesma chave mas não
 * consome crédito pago (free tier diário). Responde em ~10s; é a rede
 * de segurança quando a NVIDIA está fora e o modelo pago falhou.
 */
async function orFreeChat(
  system: string,
  userContent: string,
  maxTokens?: number,
  timeoutMs?: number,
  model?: string,
  images?: string[],
): Promise<Record<string, unknown> | null> {
  const key = await getSecret("OPENROUTER_API_KEY");
  if (!key) return null;
  const userMsg = images?.length
    ? {
        role: "user",
        content: [
          { type: "text", text: userContent },
          ...images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      }
    : { role: "user", content: userContent };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      "HTTP-Referer": optionalEnv("APP_URL") ?? "https://seekerai.digital",
      "X-Title": "SeekerAi",
    },
    body: JSON.stringify({
      model: model ?? OR_FREE_TEXT_MODEL,
      stream: false,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      messages: [
        { role: "system", content: system },
        userMsg,
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs ?? 40_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.error("[openrouter:free] chat falhou:", res?.status ?? "network");
    return null;
  }
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

// Breaker da imagem NVIDIA também — endpoint free morto queimava 120s
// por tentativa (e o site tenta até 5 imagens + retries).
let nvidiaImgDownUntil = 0;

/** Imagem na NVIDIA (genai/FLUX). Retorna data URL ou null. */
async function nvidiaImage(prompt: string, errors?: string[]): Promise<string | null> {
  if (Date.now() < nvidiaImgDownUntil) return null;
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
    nvidiaImgDownUntil = Date.now() + 3 * 60_000;
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
  const enhanceSys = [
    "You are a senior art director writing text-to-image prompts for FLUX.",
    "Rewrite the user's request (Portuguese) as ONE optimized English image prompt.",
    "Photorealistic commercial/editorial quality; describe scene, lighting and composition explicitly.",
    nome
      ? `Business: ${nome}${categoria ? ` (${categoria})` : ""}${cidade ? ` — ${cidade}, Brazil` : ""}. Weave the real business identity into the scene (products, signage, colors); never invent another business.`
      : categoria ? `Business category: ${categoria}.` : "",
    "If the user asked for a promo post/ad with text, include the EXACT short headline to render inside double quotes (keep it in Portuguese, max 5 words, spelled correctly). If not asked for, end with 'no text, no letters, no words'.",
    "Reply with ONLY the image prompt — no explanations.",
  ].filter(Boolean).join("\n");
  // GLM gasta tokens em reasoning_content — folga pra resposta não truncar.
  const res = (await nvidiaChat(enhanceSys, userPrompt, 1500, 30_000).catch(() => null))
    ?? (await orFreeChat(enhanceSys, userPrompt, 1500, 30_000).catch(() => null));
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
  jobId?: string;
  jobTable?: string;
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

/* ---------- idioma do site pelo país do lead ---------- */

// País ISO → idioma do site gerado. Desconhecido cai em inglês (o PT só
// entra quando o país é BR/PT — nunca por "default cego").
const COUNTRY_LANG: Record<string, string> = {
  BR: "pt", PT: "pt",
  US: "en", GB: "en", IE: "en", AU: "en", NZ: "en", CA: "en",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", UY: "es",
  PY: "es", BO: "es", EC: "es", VE: "es", GT: "es", HN: "es", SV: "es",
  NI: "es", CR: "es", PA: "es", DO: "es", CU: "es",
  FR: "fr", DE: "de", IT: "it",
};

function leadPais(lead: Record<string, unknown>): string | null {
  const dados = isRecord(lead.dados) ? lead.dados : {};
  return (asString(lead.pais, 8) ?? asString(dados.pais, 8))?.toUpperCase() ?? null;
}

/** Idioma do site: deriva do país do estabelecimento, não do usuário. */
function siteLangFor(lead: Record<string, unknown>): string {
  const pais = leadPais(lead);
  if (!pais) return "pt"; // lead antigo sem país → comportamento BR preservado
  return COUNTRY_LANG[pais] ?? "en";
}

/** languageCode pro Places / hl do Serper. */
function placesLang(lang: string): string {
  return { pt: "pt-BR", en: "en", es: "es", fr: "fr", de: "de", it: "it" }[lang] ?? "en";
}

// Adjetivo do país nos prompts de imagem — "a Brazilian barbershop" não
// pode aparecer em site de lead americano.
const COUNTRY_ADJ: Record<string, string> = {
  BR: "Brazilian", PT: "Portuguese", US: "American", CA: "Canadian",
  GB: "British", IE: "Irish", AU: "Australian", NZ: "New Zealand",
  MX: "Mexican", AR: "Argentinian", CO: "Colombian", CL: "Chilean",
  PE: "Peruvian", UY: "Uruguayan", PY: "Paraguayan", ES: "Spanish",
  FR: "French", DE: "German", IT: "Italian", JP: "Japanese",
};

// Tom humano, texto puro: a saída vai pra chat/WhatsApp e telas que não
// renderizam markdown — #, **, -- e tabelas aparecem como lixo literal.
const NO_MARKDOWN = [
  "FORMATO OBRIGATÓRIO: texto puro e natural, como uma pessoa escreveria.",
  "PROIBIDO markdown: sem #, ##, ###, *, **, ***, _, __, ---, >, |, `,",
  "tabelas e linhas de separação. Títulos de seção vão como frase simples",
  "seguida de dois-pontos (ex.: \"Oportunidades:\"). Itens vão como frases",
  "numeradas \"1. \" ou parágrafos — nunca bullets com * ou -.",
].join("\n");

/** Texto do primeiro choice — null quando o modelo respondeu vazio
 *  (modelo de raciocínio que gastou o budget em reasoning_content). */
function chatContent(data: Record<string, unknown> | null): string | null {
  const ch = data && Array.isArray(data.choices) ? data.choices : [];
  const c = isRecord(ch[0]) && isRecord(ch[0].message)
    ? ch[0].message.content
    : null;
  return typeof c === "string" && c.trim() ? c : null;
}

/** Remove resíduos de markdown que o modelo emite apesar da instrução. */
function stripMarkdown(text: string): string {
  return text
    // títulos ###/##/# → mantém o texto
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    // negrito/itálico → texto puro
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(?<![\w])_([^_\n]+)_(?![\w])/g, "$1")
    // código inline/bloco → texto
    .replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/`/g, ""))
    .replace(/`([^`\n]+)`/g, "$1")
    // linha de separação ---/***/___ → some
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, "")
    // blockquote > → vira texto
    .replace(/^\s*>\s?/gm, "")
    // bullets - /* / + → marcador simples
    .replace(/^(\s*)[-*+]\s+/gm, "$1• ")
    // colapsa 3+ linhas vazias
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function systemPromptFor(action: string, lang: string): string {
  const L = langName(lang);
  switch (action) {
    case "deep_strategy":
      return [
        `Você é um estrategista de vendas B2B experiente conversando com um colega.`,
        `Analise o estabelecimento e produza: diagnóstico, oportunidades, ângulos de`,
        `abordagem e próximos passos práticos. Responda OBRIGATORIAMENTE em ${L},`,
        `direto e acionável, como quem explica pessoalmente — sem jargão de slide.`,
        NO_MARKDOWN,
      ].join("\n");
    case "sales_reply":
      return `Você é um copiloto de vendas. Escreva uma mensagem de abordagem curta, personalizada e natural em ${L} para o estabelecimento descrito — como um WhatsApp que uma pessoa real mandaria. Sem emojis excessivos, sem promessas irreais, sem qualquer formatação markdown (nada de *, **, #, -, >, listas).`;
    case "enhance_reply":
      return [
        "Você escreve mensagens de atendimento ao cliente da SeekerAi.",
        "Você recebe o contexto da conversa e um rascunho do atendente:",
        "com rascunho, reescreva-o numa mensagem pronta pra enviar — clara,",
        "cordial, profissional e completa, corrigindo português e respondendo",
        "tudo o que o cliente perguntou. Sem rascunho, ESCREVA a resposta do",
        "zero: leia a conversa e responda a MENSAGEM MARCADA (ou a última dúvida",
        "do cliente) como um suporte humano bom faria. Sem saudação robotizada,",
        "sem promessas que o contexto não sustente, sem inventar política de",
        "reembolso/prazo. Escreva em português (pt-BR), tom humano — direto",
        "mas gentil. Saída: só o texto da mensagem, nada mais.",
        NO_MARKDOWN,
      ].join("\n");
    case "lead_assist":
      return [
        "Você é o copiloto de conversão do SeekerAi: um closer B2B experiente",
        "acompanhando este lead específico em tempo real — conversa, não relatório.",
        "Use TODOS os dados do contexto (estabelecimento, avaliações, site, WhatsApp, status",
        "do funil e o que já foi gerado) para responder de forma concreta.",
        "Ajude a converter: sugira ângulos de abordagem, mensagens prontas para copiar,",
        "respostas para objeções, próximos passos e o que fazer em cada etapa do funil",
        "(novo → contatado → respondeu → proposta → ganho).",
        `Respostas curtas e diretas OBRIGATORIAMENTE em ${L}, com mensagens prontas entre aspas quando fizer sentido.`,
        NO_MARKDOWN,
      ].join("\n");
    case "editor_assist":
      return [
        "Você é o assistente de IA de um editor visual de sites. Você recebe o HTML atual",
        "(de um elemento selecionado ou da página inteira) e uma instrução do usuário, e",
        "devolve o HTML com a alteração aplicada.",
        "",
        "SAÍDA OBRIGATÓRIA — um único JSON, sem markdown nem texto fora dele:",
        '{"reply":"...","html":"...","imagePrompt":"..."}',
        "",
        "- \"html\": o HTML COMPLETO do alvo já com a alteração — preserve classes, ids,",
        "  data-attributes, links, botões, scripts, estilos e a estrutura existente; mude",
        "  só o necessário. Se a instrução não exigir mudança no HTML (pergunta, elogio,",
        "  pedido de imagem), omita o campo.",
        "- \"reply\": resposta curta pro usuário (1-2 frases) no idioma dele dizendo o que",
        "  foi feito.",
        "- \"imagePrompt\": só quando o usuário pedir uma IMAGEM NOVA gerada por IA",
        "  (foto, arte, ilustração). Nunca invente URL de imagem: omita \"html\" e descreva",
        "  a imagem em inglês, detalhada — o app gera e insere depois.",
        "- Se vierem URLs de imagem anexadas, use-as como <img src=\"URL\"> quando o",
        "  pedido for adicionar foto/imagem (galeria, hero, card, fundo).",
        "- Nunca remova funcionalidades (botões de agendamento/WhatsApp, mapas, vídeos,",
        "  formulários, lightbox) a menos que peçam explicitamente.",
        "- Mantenha o idioma dos textos que já existem no HTML.",
        `Responda a parte conversacional em ${L}.`,
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

/** Gera imagem: NVIDIA FLUX (gratuito) primeiro — Gemini do OpenRouter
 * (~$0,04/img) só quando o gratuito falha. Barateia o preenchimento de
 * fotos do site do lead, que pode chegar a 5 imagens por geração. */
async function generateSiteImage(
  apiKey: string | null,
  imagePrompt: string,
  errors?: string[],
): Promise<string | null> {
  const free = await nvidiaImage(imagePrompt, errors);
  if (free) return free;
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
  return null;
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

// sites.slug exige ^[a-z0-9][a-z0-9-]{1,60}$ — máx. 61 chars e
// min. 2; sem o cap o nome grande do lead derrubava o publish.
const slugify = (s: string) => {
  const out = s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 61).replace(/-+$/g, "");
  return out.length >= 2 ? out : "site";
};

/** Tema + paleta visual por categoria do negócio.
    O tipo escolhe o layout (barbearia dark / beleza editorial);
    a paleta troca as cores do tema editorial pra combinar com o nicho. */
function siteThemeFor(categoria: string | null): { tipo: "barbearia" | "beleza"; paleta: string } {
  const c = (categoria ?? "").toLowerCase();
  if (/barbearia|barber|barbeiro/.test(c)) return { tipo: "barbearia", paleta: "barbearia" };
  const paleta =
    /tatuagem|tattoo|piercing/.test(c) ? "tattoo"
    // Ordem importa: "salão de festas" tem "salão" (beleza), "estética
    // automotiva" tem "estética" (beleza), "clínica veterinária" tem
    // "clínica" — os específicos sempre antes dos amplos.
    : /buffet|festa|evento|cerimonial|catering|banquete|recepc|sonoriz/.test(c) ? "eventos"
    : /estética automotiva|estetica automotiva|detalhamento|funilaria/.test(c) ? "carbono"
    : /oficina|mecânic|mecanic|lava.?jato|lava.*car|borracharia|pneu|autocenter|alinhamento|suspensã|suspensao/.test(c) ? "auto"
    : /construç|construc|reforma|elétric|eletric|hidrául|hidraul|pintura|gesso|drywall|marcenaria|serralheria|pedreiro|ar condicionado/.test(c) ? "construcao"
    : /supermercado|mercado|mercearia|hortifruti|atacad|empório|emporio|conveniência|conveniencia/.test(c) ? "mercado"
    : /açougue|acougue|peixaria|frios/.test(c) ? "acougue"
    : /padaria|confeitaria|doceria|doce|bakery/.test(c) ? "padaria"
    : /pizzaria|restaurante|hamburgueria|lanchonete|churrascaria|sushi|cantina|comida|marmita/.test(c) ? "trattoria"
    : /cafeteria|café|coffee/.test(c) ? "cafe"
    : /imobiliár|imobiliari|corretor|imóveis|imoveis/.test(c) ? "imobiliaria"
    : /arquitet|interiores|design de interiores/.test(c) ? "arquitetura"
    : /viagem|viagens|turismo|passeio/.test(c) ? "viagem"
    : /assistência|assistencia|conserto|reparo|celular|informática|informatica|eletrônic|eletronic/.test(c) ? "assistencia"
    : /beleza|salão|salao|estética|estetica|manicure|nail|sobrancelha|cabelo|cabeleireiro|depilaç|maquiag|lash|brow|cosmet|massag|\bspa\b/.test(c) ? "beleza"
    : /pet|veterinár/.test(c) ? "pet"
    : /farmácia|farmacia|drogaria/.test(c) ? "farmacia"
    : /ótica|otica|optica/.test(c) ? "otica"
    : /dentista|clínica|clinica|medicina|fisioterapia|psicolog|laborat|odonto|saúde|saude|nutricion/.test(c) ? "clinica"
    : /academia|crossfit|personal|pilates|yoga|luta|dança|danca|fitness|gym/.test(c) ? "studio"
    : /flor|jardim|paisag/.test(c) ? "flora"
    : /advocacia|advogad|contabil|escritório|escritorio|seguro/.test(c) ? "corporativo"
    : /loja|boutique|calçado|calcado|joalheria|móveis|moveis|decoraç|decorac|papelaria|livraria|brinquedo/.test(c) ? "varejo"
    : /hotel|pousada|hospedagem|hospedaria/.test(c) ? "hotel"
    : /escola|curso|idioma|autoescola|auto.escola|habilitaç|condutor|faculdade/.test(c) ? "educacao"
    // Nicho não mapeado → "generico" dispara a classificação por IA
    // (fotos + bio + legendas) em vez de assumir beleza.
    : "generico";
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

/** hsl {0-360,0-1,0-1} → "#rrggbb" — par do hexToHsl pra girar o matiz. */
function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Gira o matiz de "#hex" ou "hsl(h,s%,l%)" — nova versão do site sai com
    esquema de cor diferente mantendo saturação/luz da identidade real. */
function hueShiftColor(color: string, deg: number): string {
  const hsl = color.startsWith("#")
    ? hexToHsl(color)
    : (() => {
      const m = color.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%\s*\)/i);
      return m ? { h: +m[1], s: +m[2] / 100, l: +m[3] / 100 } : null;
    })();
  if (!hsl) return color;
  return hslToHex((hsl.h + deg + 360) % 360, hsl.s, hsl.l);
}

/** Variáveis-base de cada paleta do tema — espelho das vars do CSS
    (bg, bg2, panel, panel2, text, muted, accent, accent2, accentInk,
    espresso). Na regeneração o esquema inteiro é girado no matiz: a
    "nova versão" sai com outra identidade de cor de verdade, e não só
    com o accent trocado. Paleta desconhecida cai na base editorial. */
const PALETTE_BASE: Record<string, string[]> = {
  beleza:     ["#faf6ef","#f2ecdf","#fffdf8","#f7f0e3","#33291c","#8b7f6d","#a9853f","#c9a869","#fffaf0","#1b140d"],
  padaria:    ["#faf3e6","#f3ead8","#fffaf0","#f6edda","#3a2c1e","#8d7a63","#b4531f","#d99a4e","#fff8ec","#241305"],
  trattoria:  ["#faf5ef","#f3ebe0","#fffaf4","#f5ecdf","#2b1d16","#8a7268","#a92f26","#c86a3f","#fff5ec","#1d0f0a"],
  cafe:       ["#f5efe7","#ede4d8","#fbf7f0","#f0e8dc","#2e241c","#86735f","#6f4e37","#a9805e","#fdf6ec","#1e140c"],
  clinica:    ["#f3f9fb","#e9f3f6","#ffffff","#eef6f8","#1d2b33","#6d828c","#25808f","#67b7c9","#f2fbfd","#0e2126"],
  studio:     ["#141518","#191b1f","#1e2126","#23262c","#eef1f3","#9aa3ad","#8fd14f","#b9e58a","#8fd14f","#0b0c0e"],
  pet:        ["#f6f8f0","#eef2e4","#fcfdf7","#f1f5e6","#24301f","#75836a","#4f8f46","#86b96f","#f4faee","#17210f"],
  flora:      ["#faf5f4","#f4eae8","#fffafa","#f6ecea","#322224","#8d7778","#b25f77","#d19cae","#fff5f7","#211114"],
  corporativo:["#f4f6f9","#ebf0f5","#ffffff","#eff3f8","#1e2736","#6d7688","#2f4d8f","#6d8cc4","#f0f5fd","#101a30"],
  tattoo:     ["#121114","#17161a","#1b1a1f","#211f26","#ece7df","#a29a90","#d8402f","#e8875a","#d8402f","#0a090b"],
  carbono:    ["#131518","#181b1f","#1d2025","#23272d","#e9ecef","#98a1ab","#e09b2d","#f0c56d","#e09b2d","#0b0c0e"],
  mercado:    ["#f4f7ee","#ecf1df","#fdfef8","#f0f4e3","#1c301d","#6c7d62","#2f8f4e","#e0a81e","#f4fbef","#152a1c"],
  varejo:     ["#f7f4f1","#efe9e4","#fffdfb","#f3ede7","#2a1d16","#86736a","#8f5a3c","#c9a183","#fdf6f0","#221812"],
  hotel:      ["#f5f5f1","#ecebe4","#fefefc","#f0efe8","#1a2433","#6f7886","#9a7b3f","#c9ab6a","#fdf8ec","#14202e"],
  educacao:   ["#f3f6fa","#eaf0f7","#ffffff","#eef3f9","#17283d","#6d7a8c","#2f6fb2","#f2b53d","#f0f6fd","#132236"],
  eventos:    ["#faf4ec","#f3e9d9","#fffdf8","#f6eddd","#33230f","#8a7458","#b8862e","#c96a5a","#fdf8ee","#2a1c0d"],
  acougue:    ["#f9f1ec","#f1e4dc","#fefbf8","#f5e9e1","#381410","#8c6f68","#a8322f","#c98a5a","#fdf3ee","#2c100e"],
  farmacia:   ["#f0f7f4","#e3f0ea","#fbfefd","#eaf4ef","#122a20","#5f7a6e","#1f8f6a","#6ec4a8","#eefaf5","#0e241b"],
  otica:      ["#f2f5f8","#e8edf3","#fdfefe","#edf2f7","#152230","#64727f","#3d6b9e","#8fb4d9","#eef4fb","#101b29"],
  assistencia:["#f1f4f8","#e6ebf2","#fbfcfe","#ebf0f6","#131f2e","#5d6c7e","#2d6fd0","#7fb0ec","#edf3fc","#0f1a28"],
  auto:       ["#f4f3f0","#eae8e2","#fdfcfa","#f0eee8","#221d16","#746a5d","#d9762b","#8a8f98","#fdf4ea","#1c1712"],
  construcao: ["#f7f1e9","#efe5d6","#fdfaf4","#f3ebdc","#30200f","#82725c","#b35a2e","#d9a45c","#fdf4e9","#281a0c"],
  viagem:     ["#f0f6f9","#e2eef4","#fbfdfe","#e9f2f7","#0f2533","#5f7684","#2e8fb8","#e5b96b","#edf7fc","#0d1f2b"],
  imobiliaria:["#f4f5f3","#ebecf1","#fdfdfe","#eff0f0","#141d2e","#67707f","#8a6d3b","#2f4a7a","#faf6ec","#10182a"],
  arquitetura:["#f4f3f1","#eae8e4","#fdfcfb","#f0eeea","#1d1a17","#73706a","#9c5b3e","#b98d6f","#faf3ee","#181512"],
  // Template barbearia (.bshop) — dark único, sem espresso.
  barbearia:  ["#0b0908","#12100d","#17130f","#1d1812","#f4ecdd","#a89c88","#c9a15c","#e8c98a","#171008",""],
};

/** Esquema-base do tema — usado como ponto de partida do giro de matiz
    na regeneração (a paleta do nicho continua a mesma, as cores mudam). */
function siteSchemeFor(paleta: string): string[] {
  return PALETTE_BASE[paleta] ?? PALETTE_BASE.beleza;
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
  /** Comportamento do CTA principal: agendar abre o fluxo de horário;
      zap pede/encomenda pelo WhatsApp; mapa leva ao endereço. */
  cta: "agendar" | "zap" | "mapa";
  /** Texto do botão principal ("Agendar", "Pedir pelo WhatsApp"). */
  ctaLabel: string;
  /** Eyebrow da seção de serviços e item de nav ("Cardápio", "Setores"). */
  servicosLabel: string;
  /** Primeira parte do h2 da seção ("Escolha o seu", "Ofertas da"). */
  servicosTitle: string;
  /** Palavra em itálico do h2 ("momento", "semana", "prato"). */
  servicosEm: string;
  /** Dica sob cada categoria ("toque para agendar", "peça pelo WhatsApp"). */
  servicosHint: string;
  /** Título da seção de ofertas, quando o material do IG indicar
      promoções ("Ofertas da semana"). null = nicho sem seção. */
  ofertasTitle: string | null;
  /** Guia pro prompt de copy: o que "servicos" e FAQ devem conter
      neste nicho — evita "agendamento" em mercado, "cardápio" em clínica. */
  guia: string;
}

/** Vocabulário por nicho — sem texto de salão de beleza em estúdio de
    tattoo nem "agendamento" em mercado. Determinístico por paleta. */
function nicheVocab(paleta: string, categoria: string | null): NichoVocab {
  const V: Record<string, NichoVocab> = {
    beleza: {
      rotulo: "ESPAÇO DE BELEZA", em: "se cuidar e se amar",
      desc: "beleza, cuidado e autoestima. Ambiente acolhedor e atendimento sem pressa.",
      prep: "o espaço", marquee: "Um lugar para você se cuidar", ctaEm: "se cuidar", schema: "BeautySalon",
      cta: "agendar", ctaLabel: "Agendar",
      servicosLabel: "Serviços", servicosTitle: "Escolha o seu", servicosEm: "momento",
      servicosHint: "toque para agendar", ofertasTitle: null,
      guia: "servicos = serviços de beleza/bem-estar com duracaoMin plausível (30-120). FAQ pode falar de agendamento, duração e preparo.",
    },
    barbearia: {
      rotulo: "BARBEARIA", em: "sair renovado",
      desc: "cortes clássicos e modernos, barba desenhada e atendimento de respeito. Cadeira quente, navalha afiada.",
      prep: "a barbearia", marquee: "Estilo que respeita a sua história", ctaEm: "renovar o visual", schema: "BarberShop",
      cta: "agendar", ctaLabel: "Agendar horário",
      servicosLabel: "Serviços", servicosTitle: "Escolha o seu", servicosEm: "corte",
      servicosHint: "toque para agendar", ofertasTitle: null,
      guia: "servicos = serviços de barbearia (corte, barba, sobrancelha, pigmentação, combo corte+barba) — duracaoMin 30-90. Combos e planos de assinatura viram ofertas. FAQ fala de agendamento, duração e cuidados.",
    },
    tattoo: {
      rotulo: "ESTÚDIO DE TATUAGEM", em: "marcar a sua história",
      desc: "tatuagens autorais e piercings. Ambiente criativo, atendimento sem pressa e arte de verdade.",
      prep: "o estúdio", marquee: "Arte que fica na pele", ctaEm: "se expressar", schema: "TattooParlor",
      cta: "agendar", ctaLabel: "Agendar",
      servicosLabel: "Estilos", servicosTitle: "Escolha o seu", servicosEm: "traço",
      servicosHint: "toque para agendar", ofertasTitle: null,
      guia: "servicos = estilos/trabalhos de tattoo e piercing (realismo, fine line, fechamento, piercing), duracaoMin 60-240. FAQ fala de orçamento, agendamento e cuidados.",
    },
    padaria: {
      rotulo: "PADARIA ARTESANAL", em: "saborear o pão do dia",
      desc: "pães fresquinhos, cafés e doces da casa. Cheiro de fornada e aquele atendimento de bairro.",
      prep: "a padaria", marquee: "Saindo do forno, todo dia", ctaEm: "saborear", schema: "Bakery",
      cta: "zap", ctaLabel: "Chamar no WhatsApp",
      servicosLabel: "Delícias", servicosTitle: "Do forno pra", servicosEm: "mesa",
      servicosHint: "peça pelo WhatsApp", ofertasTitle: "Ofertas da semana",
      guia: "servicos = produtos/fornadas da padaria (pães, bolos, cafés, salgados, encomendas) — duracaoMin SEMPRE null, não é agendamento. Se as legendas/fotos mostrarem ofertas ou panfletos, crie a seção ofertas. FAQ fala de encomendas, fornadas e pagamento.",
    },
    eventos: {
      rotulo: "BUFFET & EVENTOS", em: "celebrar em grande estilo",
      desc: "buffet completo e estrutura pra festas e eventos. Do casamento ao corporativo, cada detalhe pensado.",
      prep: "o espaço", marquee: "Festas que ficam na memória", ctaEm: "celebrar", schema: "EventVenue",
      cta: "zap", ctaLabel: "Pedir orçamento",
      servicosLabel: "Formatos", servicosTitle: "Escolha o seu", servicosEm: "evento",
      servicosHint: "orçamento pelo WhatsApp", ofertasTitle: "Pacotes e promoções",
      guia: "servicos = formatos de evento e cardápios oferecidos (casamento, aniversário, corporativo, churrasco, buffet em domicílio, cardápios por faixa de preço) — duracaoMin SEMPRE null, é orçamento. Se as legendas/fotos mostrarem pacotes ou promoções, crie a seção ofertas. FAQ fala de capacidade, cardápio, orçamento e antecedência de reserva.",
    },
    acougue: {
      rotulo: "AÇOUGUE", em: "o melhor corte da região",
      desc: "carnes frescas e cortes especiais todo dia. Qualidade de açougueiro de verdade.",
      prep: "o açougue", marquee: "Cortes frescos, todo dia", ctaEm: "saborear", schema: "Butcher",
      cta: "zap", ctaLabel: "Pedir pelo WhatsApp",
      servicosLabel: "Cortes", servicosTitle: "Escolha o seu", servicosEm: "corte",
      servicosHint: "peça pelo WhatsApp", ofertasTitle: "Ofertas da semana",
      guia: "servicos = cortes e produtos do açougue (cortes bovinos, picanha, linguiças artesanais, kits churrasco, embutidos, frango) — duracaoMin SEMPRE null. Promoções das legendas viram ofertas. FAQ fala de encomenda, corte sob medida e entrega.",
    },
    farmacia: {
      rotulo: "FARMÁCIA", em: "cuidar da sua saúde",
      desc: "medicamentos, dermocosméticos e aquele atendimento de farmácia de bairro. Entrega rápida na sua região.",
      prep: "a farmácia", marquee: "Sua saúde em primeiro lugar", ctaEm: "se cuidar", schema: "Pharmacy",
      cta: "zap", ctaLabel: "Pedir pelo WhatsApp",
      servicosLabel: "Produtos", servicosTitle: "Tudo pra sua", servicosEm: "saúde",
      servicosHint: "peça pelo WhatsApp", ofertasTitle: "Ofertas da farmácia",
      guia: "servicos = categorias e serviços da farmácia (medicamentos e genéricos, dermocosméticos, vitaminas, manipulação, aferição de pressão, perfumaria) — duracaoMin SEMPRE null. Promoções e descontos viram ofertas. FAQ fala de entrega, receita e formas de pagamento.",
    },
    otica: {
      rotulo: "ÓTICA", em: "enxergar melhor",
      desc: "armações, lentes e exame de vista completo. Seu olhar merece o melhor ajuste.",
      prep: "a ótica", marquee: "Armações novas toda semana", ctaEm: "enxergar", schema: "Optician",
      cta: "zap", ctaLabel: "Falar no WhatsApp",
      servicosLabel: "Produtos", servicosTitle: "Escolha o seu", servicosEm: "estilo",
      servicosHint: "visite a loja", ofertasTitle: "Promoções da ótica",
      guia: "servicos = categorias da ótica (armações, óculos de sol, lentes multifocais, exame de vista, ajustes) — duracaoMin null, exceto exame de vista se citado (20-40). Promoções viram ofertas. FAQ fala de exame, prazo e garantia.",
    },
    assistencia: {
      rotulo: "ASSISTÊNCIA TÉCNICA", em: "resolver sem dor de cabeça",
      desc: "conserto rápido e diagnóstico honesto pro seu aparelho. Peças de qualidade, prazo cumprido.",
      prep: "a assistência", marquee: "Seu aparelho como novo", ctaEm: "resolver", schema: "ProfessionalService",
      cta: "zap", ctaLabel: "Pedir orçamento",
      servicosLabel: "Serviços", servicosTitle: "Escolha o seu", servicosEm: "conserto",
      servicosHint: "orçamento pelo WhatsApp", ofertasTitle: null,
      guia: "servicos = reparos e serviços técnicos (troca de tela, bateria, formatação, manutenção, destrava, chip) — duracaoMin 30-120 plausível por reparo. FAQ fala de orçamento, garantia e prazo.",
    },
    auto: {
      rotulo: "OFICINA MECÂNICA", em: "seu carro em boas mãos",
      desc: "manutenção, reparo e revisão com honestidade. Diagnóstico certo, preço justo.",
      prep: "a oficina", marquee: "Seu carro rodando liso", ctaEm: "confiar", schema: "AutoRepair",
      cta: "zap", ctaLabel: "Pedir orçamento",
      servicosLabel: "Serviços", servicosTitle: "Escolha o seu", servicosEm: "serviço",
      servicosHint: "orçamento pelo WhatsApp", ofertasTitle: "Combos de revisão",
      guia: "servicos = serviços de oficina/lava jato/borracharia (revisão, troca de óleo, freios, suspensão, pneus, lavagem completa, alinhamento) — duracaoMin 30-240. Combos e pacotes viram ofertas. FAQ fala de orçamento, garantia e agendamento.",
    },
    construcao: {
      rotulo: "CONSTRUÇÃO & REFORMAS", em: "transformar seu espaço",
      desc: "obras, reformas e acabamentos com prazo e qualidade. Seu projeto executado direito.",
      prep: "a equipe", marquee: "Obra limpa, no prazo", ctaEm: "transformar", schema: "HomeAndConstructionBusiness",
      cta: "zap", ctaLabel: "Pedir orçamento",
      servicosLabel: "Serviços", servicosTitle: "Escolha o seu", servicosEm: "projeto",
      servicosHint: "orçamento pelo WhatsApp", ofertasTitle: null,
      guia: "servicos = serviços de obra (reforma, elétrica, hidráulica, pintura, gesso, acabamento, pequenos reparos) — duracaoMin SEMPRE null, é orçamento por projeto. FAQ fala de orçamento, prazo, visita técnica e garantia.",
    },
    viagem: {
      rotulo: "AGÊNCIA DE VIAGENS", em: "conhecer o mundo",
      desc: "roteiros, pacotes e passagens com cuidado em cada detalhe. Sua próxima viagem começa aqui.",
      prep: "a agência", marquee: "Sua próxima aventura", ctaEm: "viajar", schema: "TravelAgency",
      cta: "zap", ctaLabel: "Montar minha viagem",
      servicosLabel: "Pacotes", servicosTitle: "Escolha o seu", servicosEm: "destino",
      servicosHint: "roteiro pelo WhatsApp", ofertasTitle: "Promoções de viagem",
      guia: "servicos = pacotes e serviços de viagem (pacotes nacionais/internacionais, passagens, hospedagem, seguro viagem, intercâmbio) — duracaoMin SEMPRE null. Pacotes promocionais viram ofertas. FAQ fala de pagamento, documentação e personalização de roteiro.",
    },
    imobiliaria: {
      rotulo: "IMOBILIÁRIA", em: "o seu novo endereço",
      desc: "imóveis selecionados e atendimento que entende o que você procura. Compra, venda e locação.",
      prep: "a imobiliária", marquee: "Seu lar te espera", ctaEm: "encontrar", schema: "RealEstateAgent",
      cta: "zap", ctaLabel: "Falar com corretor",
      servicosLabel: "Imóveis", servicosTitle: "Encontre o seu", servicosEm: "lar",
      servicosHint: "fale com um corretor", ofertasTitle: null,
      guia: "servicos = tipos de imóvel e serviços da imobiliária (venda, locação, avaliação, captação, administração, lançamentos) — duracaoMin SEMPRE null. FAQ fala de documentação, visita e financiamento.",
    },
    arquitetura: {
      rotulo: "ARQUITETURA & INTERIORES", em: "projetar seu espaço",
      desc: "projetos sob medida que unem beleza e função. Do conceito à entrega, em cada detalhe.",
      prep: "o escritório", marquee: "Projetos que inspiram", ctaEm: "projetar", schema: "ProfessionalService",
      cta: "zap", ctaLabel: "Falar do projeto",
      servicosLabel: "Serviços", servicosTitle: "Escolha o seu", servicosEm: "projeto",
      servicosHint: "orçamento pelo WhatsApp", ofertasTitle: null,
      guia: "servicos = serviços de projeto (arquitetônico, interiores, consultoria, acompanhamento de obra, consultoria de ambientação) — duracaoMin SEMPRE null. FAQ fala de processo, prazo e como começar.",
    },
    mercado: {
      rotulo: "MERCADO", em: "economizar todo dia",
      desc: "ofertas fresquinhas, hortifruti e aquele atendimento de bairro. Preço bom de verdade.",
      prep: "o mercado", marquee: "Ofertas novas toda semana", ctaEm: "economizar", schema: "GroceryStore",
      cta: "mapa", ctaLabel: "Como chegar",
      servicosLabel: "Setores", servicosTitle: "Todos os", servicosEm: "corredores",
      servicosHint: "ofertas no balcão", ofertasTitle: "Ofertas da semana",
      guia: "servicos = setores/departamentos e conveniências do mercado (hortifruti, padaria, açougue, ofertas da semana, entrega) — duracaoMin SEMPRE null. Se o material do Instagram mostrar panfletos/promoções, crie a seção ofertas com as campanhas vistas. NUNCA fale de agendamento. FAQ fala de entrega, pagamento e promoções.",
    },
    trattoria: {
      rotulo: "RESTAURANTE", em: "viver a boa mesa",
      desc: "pratos da casa feitos com carinho. Ambiente acolhedor pra comer bem e ficar à vontade.",
      prep: "a casa", marquee: "Mesa posta, coração aberto", ctaEm: "saborear", schema: "Restaurant",
      cta: "zap", ctaLabel: "Pedir pelo WhatsApp",
      servicosLabel: "Cardápio", servicosTitle: "Escolha o seu", servicosEm: "prato",
      servicosHint: "peça pelo WhatsApp", ofertasTitle: "Combos e promoções",
      guia: "servicos = pratos/categorias do cardápio (entradas, pratos da casa, sobremesas, delivery) — duracaoMin SEMPRE null. Se as legendas/fotos mostrarem promoções, combos ou happy hour, crie a seção ofertas. FAQ fala de delivery, reservas e formas de pagamento.",
    },
    cafe: {
      rotulo: "CAFÉ ESPECIAL", em: "viver o ritual do café",
      desc: "cafés especiais, métodos e lanches da casa. Um cantinho pra desacelerar.",
      prep: "o café", marquee: "Café passado na hora", ctaEm: "desacelerar", schema: "CafeOrCoffeeShop",
      cta: "zap", ctaLabel: "Chamar no WhatsApp",
      servicosLabel: "Cardápio", servicosTitle: "Escolha o seu", servicosEm: "ritual",
      servicosHint: "peça pelo WhatsApp", ofertasTitle: "Combos da casa",
      guia: "servicos = itens do cardápio (métodos, espressos, lanches, doces) — duracaoMin SEMPRE null. Combos/promoções nas legendas viram ofertas. FAQ fala de métodos, encomendas e pagamento.",
    },
    clinica: {
      rotulo: "CLÍNICA", em: "cuidar da sua saúde",
      desc: "atendimento humanizado e cuidado completo. Estrutura pensada pra você se sentir bem.",
      prep: "a clínica", marquee: "Cuidado de verdade", ctaEm: "se cuidar", schema: "MedicalClinic",
      cta: "agendar", ctaLabel: "Agendar consulta",
      servicosLabel: "Tratamentos", servicosTitle: "Escolha o seu", servicosEm: "tratamento",
      servicosHint: "toque para agendar", ofertasTitle: null,
      guia: "servicos = consultas/tratamentos/exames com duracaoMin plausível (30-60). FAQ fala de agendamento, convênios e preparo.",
    },
    studio: {
      rotulo: "STUDIO FITNESS", em: "evoluir todo dia",
      desc: "treino, técnica e constância. Energia pra você sair melhor do que entrou.",
      prep: "o estúdio", marquee: "Seu melhor treino te espera", ctaEm: "evoluir", schema: "ExerciseGym",
      cta: "zap", ctaLabel: "Começar pelo WhatsApp",
      servicosLabel: "Modalidades", servicosTitle: "Escolha o seu", servicosEm: "treino",
      servicosHint: "monte seu plano", ofertasTitle: "Planos em destaque",
      guia: "servicos = modalidades/planos (musculação, funcional, aulas, personal) — duracaoMin 45-60 só pra aulas; planos duracaoMin null. Planos promocionais/matrícula viram ofertas. FAQ fala de planos, aula experimental e horários.",
    },
    pet: {
      rotulo: "PETSHOP", em: "cuidar de quem te ama",
      desc: "banho, tosa e cuidado completo pro seu melhor amigo. Carinho em cada detalhe.",
      prep: "o espaço", marquee: "Pet feliz, dono tranquilo", ctaEm: "cuidar deles", schema: "PetStore",
      cta: "agendar", ctaLabel: "Agendar banho",
      servicosLabel: "Serviços", servicosTitle: "Escolha o melhor", servicosEm: "cuidado",
      servicosHint: "toque para agendar", ofertasTitle: "Combos e pacotes",
      guia: "servicos = banho, tosa, hidratação, táxi dog, vacinas se citado — duracaoMin 45-120. Combos/pacotes promocionais viram ofertas. FAQ fala de agendamento, porte e preparo.",
    },
    flora: {
      rotulo: "FLORICULTURA", em: "florescer o seu dia",
      desc: "arranjos autorais e flores fresquinhas. Delicadeza pra qualquer momento.",
      prep: "o ateliê", marquee: "Flores frescas, todo dia", ctaEm: "florescer", schema: "Florist",
      cta: "zap", ctaLabel: "Encomendar",
      servicosLabel: "Arranjos", servicosTitle: "Escolha o seu", servicosEm: "arranjo",
      servicosHint: "encomende pelo WhatsApp", ofertasTitle: "Edições especiais",
      guia: "servicos = arranjos, buquês, encomendas pra ocasiões, assinatura de flores — duracaoMin SEMPRE null. Coleções/edições especiais viram ofertas. FAQ fala de encomenda, entrega e prazo.",
    },
    carbono: {
      rotulo: "ESTÉTICA AUTOMOTIVA", em: "brilhar de novo",
      desc: "detalhamento, proteção e acabamento de precisão. Seu carro tratado como merece.",
      prep: "o estúdio", marquee: "Detalhe que faz diferença", ctaEm: "renovar", schema: "AutoBodyShop",
      cta: "zap", ctaLabel: "Pedir orçamento",
      servicosLabel: "Serviços", servicosTitle: "Escolha o", servicosEm: "detalhe",
      servicosHint: "orçamento pelo WhatsApp", ofertasTitle: null,
      guia: "servicos = serviços automotivos (polimento, vitrificação, higienização, PPF) — duracaoMin 60-480. FAQ fala de orçamento, prazo e cuidados.",
    },
    corporativo: {
      rotulo: "ESPAÇO PROFISSIONAL", em: "resolver com confiança",
      desc: "atendimento especializado e soluções sob medida. Seriedade com atenção de verdade.",
      prep: "o escritório", marquee: "Confiança em cada detalhe", ctaEm: "resolver", schema: "ProfessionalService",
      cta: "zap", ctaLabel: "Falar com especialista",
      servicosLabel: "Especialidades", servicosTitle: "Escolha a sua", servicosEm: "frente",
      servicosHint: "consulte pelo WhatsApp", ofertasTitle: null,
      guia: "servicos = áreas de atuação/especialidades do negócio — duracaoMin SEMPRE null. FAQ fala de primeira consulta, prazos e honorários de forma genérica.",
    },
    varejo: {
      rotulo: "LOJA", em: "encontrar o seu estilo",
      desc: "curadoria de produtos e aquele atendimento que faz diferença. Novidades toda semana.",
      prep: "a loja", marquee: "Novidades chegando sempre", ctaEm: "garimpar", schema: "Store",
      cta: "mapa", ctaLabel: "Como chegar",
      servicosLabel: "Produtos", servicosTitle: "Garimpe o seu", servicosEm: "achado",
      servicosHint: "novidades na loja", ofertasTitle: "Ofertas da loja",
      guia: "servicos = categorias de produtos/coleções da loja — duracaoMin SEMPRE null. Liquidações, coleções e campanhas das legendas viram ofertas. FAQ fala de trocas, pagamento e entrega.",
    },
    hotel: {
      rotulo: "HOSPEDAGEM", em: "descansar de verdade",
      desc: "conforto, localização e aquele cuidado em cada detalhe da estadia.",
      prep: "a hospedagem", marquee: "Sua estadia começa aqui", ctaEm: "descansar", schema: "LodgingBusiness",
      cta: "zap", ctaLabel: "Reservar pelo WhatsApp",
      servicosLabel: "Acomodações", servicosTitle: "Escolha a sua", servicosEm: "estadia",
      servicosHint: "reserve pelo WhatsApp", ofertasTitle: "Pacotes e temporadas",
      guia: "servicos = tipos de quarto/acomodações e comodidades — duracaoMin SEMPRE null. Pacotes promocionais viram ofertas. FAQ fala de check-in, reserva e estacionamento.",
    },
    educacao: {
      rotulo: "ESCOLA & CURSOS", em: "aprender pra valer",
      desc: "ensino de verdade, turmas acolhedoras e atenção em cada etapa.",
      prep: "a escola", marquee: "Sua próxima etapa começa aqui", ctaEm: "aprender", schema: "EducationalOrganization",
      cta: "zap", ctaLabel: "Falar com a secretaria",
      servicosLabel: "Cursos", servicosTitle: "Escolha o seu", servicosEm: "caminho",
      servicosHint: "matricule-se pelo WhatsApp", ofertasTitle: "Turmas abertas",
      guia: "servicos = cursos/modalidades/turmas oferecidas — duracaoMin SEMPRE null. Turmas abertas e bolsas viram ofertas. FAQ fala de matrícula, materiais e horários.",
    },
  };
  return V[paleta] ?? {
    rotulo: (categoria ?? "ESTABELECIMENTO LOCAL").toUpperCase(),
    em: "se sentir em casa",
    desc: `${(categoria ?? "atendimento").toLowerCase()} e atendimento de verdade. Ambiente acolhedor, sem pressa.`,
    prep: "o espaço", marquee: "Um lugar pra você", ctaEm: "se cuidar", schema: "LocalBusiness",
    cta: "zap", ctaLabel: "Chamar no WhatsApp",
    servicosLabel: "Serviços", servicosTitle: "Escolha o seu", servicosEm: "momento",
    servicosHint: "chame pelo WhatsApp", ofertasTitle: "Ofertas",
    guia: "servicos = o que o estabelecimento oferece, inferido da categoria e das legendas — duracaoMin só se for serviço com hora marcada, senão null. Adapte o FAQ ao tipo de negócio.",
  };
}

/**
 * Fallback determinístico quando a IA não devolve servicos (timeout,
 * modelo fora do ar) — a seção nunca renderiza vazia.
 */
function defaultServicos(paleta: string, lang = "pt"): Record<string, unknown>[] {
  // Fallback localizado — só roda quando a IA não devolveu serviços.
  if (lang !== "pt") {
    const GEN: Record<string, [string, string, string | null][]> = {
      en: [["Signature service", "Our most requested option", null],
        ["Popular choice", "A favorite among regulars", null],
        ["Custom request", "Tell us what you need — we make it happen", null]],
      es: [["Servicio destacado", "La opción más pedida", null],
        ["Favorito de la casa", "El preferido de los clientes", null],
        ["A pedido", "Cuéntanos qué necesitas — lo resolvemos", null]],
    };
    const L2: Record<string, Record<string, [string, string, string | null][]>> = {
      en: {
        barbearia: [["Haircut", "Classic or modern cut with finish", "40-60"],
          ["Beard", "Full beard with razor and hot towel", "30-45"],
          ["Eyebrows", "Trim and design", "15-20"]],
        beleza: [["Hair", "Cut, blowout, color and treatments", "60-120"],
          ["Facial", "Skin cleansing and facial treatments", "45-90"],
          ["Nails", "Manicure and pedicure", "45-60"]],
        tattoo: [["Custom tattoo", "Original piece designed with the artist", "120-240"],
          ["Realism", "Black & grey or full color", "180-360"],
          ["Piercing", "Applied with single-use materials", "30-60"]],
        mercado: [["Fresh produce", "Fruits and vegetables every day", null],
          ["Butcher", "Fresh and special cuts", null],
          ["Bakery", "Breads and deli at the counter", null],
          ["Weekly deals", "New promotions every week", null]],
        trattoria: [["House dishes", "Homemade specialties", null],
          ["Desserts", "Artisanal sweets to finish", null],
          ["Delivery", "Order at home on WhatsApp", null]],
        padaria: [["Artisan breads", "Natural fermentation, baked daily", null],
          ["Pastry", "Cakes and house sweets", null],
          ["Breakfast", "Coffee, sandwiches and fresh snacks", null]],
        cafe: [["Specialty coffee", "Espresso, pour-over and methods", null],
          ["Snacks", "Toast, sandwiches and house snacks", null],
          ["Sweets", "Desserts to go with your coffee", null]],
      },
      es: {
        barbearia: [["Corte", "Corte clásico o moderno con acabado", "40-60"],
          ["Barba", "Barba completa con navaja y toalla caliente", "30-45"],
          ["Cejas", "Diseño y perfilado", "15-20"]],
        beleza: [["Cabello", "Corte, peinado, color y tratamientos", "60-120"],
          ["Facial", "Limpieza facial y tratamientos", "45-90"],
          ["Uñas", "Manicura y pedicura", "45-60"]],
        tattoo: [["Tatuaje autoral", "Pieza original diseñada con el artista", "120-240"],
          ["Realismo", "Sombreado o a color", "180-360"],
          ["Piercing", "Con material desechable", "30-60"]],
        mercado: [["Frutas y verduras", "Frescura todos los días", null],
          ["Carnicería", "Cortes frescos y especiales", null],
          ["Panadería", "Panes y fiambres en el mostrador", null],
          ["Ofertas de la semana", "Promociones nuevas cada semana", null]],
      },
    };
    const t = L2[lang] ?? L2.en;
    const list = t[paleta] ?? (GEN[lang] ?? GEN.en);
    return list.map(([nome, descricao, d]) => {
      const [a, b] = (d ?? "").split("-").map(Number);
      return { nome, descricao, duracaoMin: a ? Math.round((a + (b ?? a)) / 2) : null };
    });
  }
  const S: Record<string, [string, string, string | null][]> = {
    beleza: [
      ["Cabelo", "Corte, escova, coloração e tratamentos capilares", "60-120"],
      ["Estética facial", "Limpeza de pele e tratamentos faciais", "45-90"],
      ["Mãos e pés", "Manicure, pedicure e esmaltação", "45-60"],
    ],
    barbearia: [
      ["Corte", "Corte clássico ou atual com finalização", "40-60"],
      ["Barba", "Barba completa com navalha e toalha quente", "30-45"],
      ["Sobrancelha", "Alinhamento e design", "15-20"],
    ],
    tattoo: [
      ["Tattoo autoral", "Projeto exclusivo criado junto com o artista", "120-240"],
      ["Realismo", "Preto e cinza ou colorido", "180-360"],
      ["Fechamento", "Braço, perna ou costas por sessões", "240-480"],
      ["Piercing", "Aplicação com material descartável", "30-60"],
    ],
    trattoria: [
      ["Pratos da casa", "Especialidades feitas com carinho", null],
      ["Sobremesas", "Doces artesanais pra fechar a refeição", null],
      ["Delivery", "Peça em casa pelo WhatsApp", null],
    ],
    padaria: [
      ["Pães artesanais", "Fermentação natural e fornadas diárias", null],
      ["Confeitaria", "Bolos, doces e tortas da casa", null],
      ["Café da manhã", "Cafés, lanches e salgados fresquinhos", null],
    ],
    cafe: [
      ["Cafés especiais", "Espresso, filtrados e métodos especiais", null],
      ["Lanches", "Tostas, sanduíches e lanches da casa", null],
      ["Doces", "Sobremesas pra acompanhar o café", null],
    ],
    clinica: [
      ["Consultas", "Atendimento humanizado e completo", "30-60"],
      ["Exames", "Check-ups e exames de rotina", "30-60"],
      ["Acompanhamento", "Retornos e tratamento contínuo", "30-45"],
    ],
    studio: [
      ["Musculação", "Treino com acompanhamento", null],
      ["Aulas coletivas", "Turmas com horários variados", "45-60"],
      ["Avaliação", "Avaliação física inicial", "30-45"],
    ],
    pet: [
      ["Banho", "Banho completo com produtos específicos", "60-90"],
      ["Tosa", "Higiênica e estética por porte", "60-120"],
      ["Cuidado", "Hidratação, escovação e cuidado extra", "45-90"],
    ],
    flora: [
      ["Buquês", "Arranjos autorais pra qualquer ocasião", null],
      ["Plantas", "Vasos e plantas pra casa ou escritório", null],
      ["Encomendas", "Presentes e decoração sob encomenda", null],
    ],
    carbono: [
      ["Detalhamento", "Lavagem técnica e acabamento completo", "120-240"],
      ["Polimento", "Correção de pintura e brilho", "240-480"],
      ["Proteção", "Vitrificação, cera e películas", "240-480"],
    ],
    corporativo: [
      ["Consultoria", "Atendimento especializado sob medida", null],
      ["Atendimento", "Primeira conversa pra entender seu caso", null],
    ],
    eventos: [
      ["Casamentos", "Buffet completo, equipe e estrutura no seu grande dia", null],
      ["Aniversários", "Festas adulto e infantil com cardápio sob medida", null],
      ["Corporativo", "Coffee breaks, confraternizações e eventos de empresa", null],
      ["Buffet em domicílio", "Levamos a festa completa até você", null],
    ],
    acougue: [
      ["Cortes especiais", "Picanha, ancho e cortes nobres do dia", null],
      ["Kit churrasco", "Seleção completa pro fim de semana", null],
      ["Embutidos artesanais", "Linguiças e embutidos feitos na casa", null],
    ],
    farmacia: [
      ["Medicamentos", "Referência e genéricos com melhor preço", null],
      ["Dermocosméticos", "Skincare e cuidados pessoais", null],
      ["Entrega rápida", "Peça pelo WhatsApp e receba em casa", null],
    ],
    otica: [
      ["Armações", "Modelos pra todos os estilos e rostos", null],
      ["Lentes", "Multifocais, antirreflexo e fotossensíveis", null],
      ["Exame de vista", "Avaliação completa na loja", "20-40"],
    ],
    assistencia: [
      ["Tela e bateria", "Troca rápida com peças de qualidade", "30-60"],
      ["Manutenção", "Limpeza, formatação e otimização", "60-120"],
      ["Diagnóstico", "Avaliação honesta antes do orçamento", null],
    ],
    auto: [
      ["Revisão completa", "Checklist de segurança e manutenção", "120-240"],
      ["Troca de óleo", "Óleo, filtros e itens de rotina", "30-60"],
      ["Freios e suspensão", "Diagnóstico e reparo", "60-180"],
    ],
    construcao: [
      ["Reformas", "Do banheiro à obra completa, no prazo", null],
      ["Elétrica e hidráulica", "Instalações e reparos certificados", null],
      ["Pintura e acabamento", "Acabamento fino pro seu espaço", null],
    ],
    viagem: [
      ["Pacotes nacionais", "Praias, serras e cidades do Brasil", null],
      ["Internacional", "Roteiros completos pro exterior", null],
      ["Passagens e hospedagem", "Tudo num só lugar, com suporte", null],
    ],
    imobiliaria: [
      ["Imóveis à venda", "Casas e apartamentos selecionados", null],
      ["Locação", "Aluguel com contrato tranquilo", null],
      ["Avaliação", "Quanto vale o seu imóvel?", null],
    ],
    arquitetura: [
      ["Projeto arquitetônico", "Da planta ao executivo completo", null],
      ["Interiores", "Ambientação sob medida pro seu estilo", null],
      ["Consultoria", "Orientação técnica pra sua obra", null],
    ],
    mercado: [
      ["Hortifruti", "Frutas e verduras fresquinhas todo dia", null],
      ["Açougue", "Cortes frescos e especiais", null],
      ["Padaria", "Pães e frios direto do balcão", null],
      ["Ofertas da semana", "Promoções novas toda semana", null],
    ],
    varejo: [
      ["Coleções", "Curadoria e novidades toda semana", null],
      ["Acessórios", "Peças pra completar o seu estilo", null],
      ["Novidades", "Chegadas exclusivas na loja", null],
    ],
    hotel: [
      ["Acomodações", "Quartos confortáveis e bem cuidados", null],
      ["Café da manhã", "Pra começar bem o dia", null],
      ["Estadia", "Conforto e localização privilegiada", null],
    ],
    educacao: [
      ["Cursos", "Turmas e modalidades disponíveis", null],
      ["Reforço", "Acompanhamento individualizado", null],
      ["Matrículas", "Turmas abertas — fale com a secretaria", null],
    ],
  };
  const min = (r: string | null) => {
    if (!r) return { duracaoMin: null };
    const [a, b] = r.split("-").map(Number);
    return { duracaoMin: a ? Math.round((a + (b ?? a)) / 2) : null };
  };
  return (S[paleta] ?? S.corporativo).map(([nome, descricao, d]) => ({
    nome, descricao, ...min(d),
  }));
}

/** Prompt do classificador de nicho — o vocab pedido sai no idioma do site
    (derivado do país do lead), nunca fixo em pt-BR. */
function nichoClassifySystem(lang: string): string {
  const L = langName(lang);
  const vocabSpec = lang === "pt"
    ? `preencha o vocab em pt-BR:
  {"rotulo":"RÓTULO DO NICHO EM CAIXA ALTA","em":"frase em itálico do hero",
   "desc":"linha de apresentação do negócio, uma frase","prep":"o/a + substantivo do lugar",
   "marquee":"frase curta de destaque","ctaEm":"verbo em itálico do CTA final",
   "schema":"schema.org @type apropriado","cta":"zap|agendar|mapa","ctaLabel":"texto do botão",
   "servicosLabel":"rótulo da seção de serviços/ofertas","servicosTitle":"início do h2 da seção",
   "servicosEm":"palavra em itálico do h2","servicosHint":"dica sob cada item",
   "ofertasTitle":"título da seção de ofertas ou null","guia":"instruções pro redator: o que
   servicos contém neste nicho, se duracaoMin faz sentido (só serviços com hora marcada),
   e o que o FAQ deve cobrir"}`
    : `fill the vocab ENTIRELY IN ${L} (every string, including "guia"):
  {"rotulo":"NICHE LABEL IN UPPERCASE","em":"italic hero phrase",
   "desc":"one-line business intro","prep":"article + noun for the place (e.g. 'the studio')",
   "marquee":"short punchy phrase","ctaEm":"italic verb for the final CTA",
   "schema":"appropriate schema.org @type","cta":"zap|agendar|mapa","ctaLabel":"button text",
   "servicosLabel":"services/offers section label","servicosTitle":"start of the section h2",
   "servicosEm":"italic word of the h2","servicosHint":"hint under each item",
   "ofertasTitle":"offers section title or null","guia":"writer's guide: what servicos
   contains in this niche, whether duracaoMin makes sense (only for booked services),
   and what the FAQ should cover"}`;
  const invent = lang === "pt"
    ? `Se NÃO encaixar em nenhum, invente uma chave curta em português minúsculo sem acento
  (ex.: "sorveteria", "chacara", "igreja", "lavanderia") e ${vocabSpec}`
    : `If it does NOT clearly fit any, invent a short lowercase key in ${L} without accents
  and ${vocabSpec}`;
  return `You classify the niche of a local business to personalize its website.
Analyze the Maps category, name, real photo descriptions, Instagram bio and captions.

Respond ONLY with JSON in this exact shape:
{"paleta":"...", "vocab":{...} | null}

- "paleta": if the business CLEARLY fits one of these, return the key and vocab:null —
  beleza, barbearia, tattoo, mercado, padaria, trattoria, cafe, clinica, studio, pet, flora,
  carbono, corporativo, varejo, hotel, educacao, eventos, acougue, farmacia, otica,
  assistencia, auto, construcao, viagem, imobiliaria, arquitetura.
- ${invent}
- "agendar" only for appointment-based business; "zap" for quotes/orders; "mapa" for walk-in visits.
- NEVER use beauty-salon language for niches that aren't beauty.
- The site language is ${L} — every user-facing string you produce must be in ${L}.`;
}

const CTA_ZAP_LABEL: Record<string, string> = {
  pt: "Agendar pelo WhatsApp", en: "Book on WhatsApp", es: "Reservar por WhatsApp",
  fr: "Réserver sur WhatsApp", de: "Per WhatsApp buchen", it: "Prenota su WhatsApp",
};

/** Vocab genérico no idioma do site — última linha de defesa quando a IA
    não devolveu patch.vocab. Nunca deixa texto PT vazar em site gringo. */
function vocabLocalFallback(v: NichoVocab, lang: string): NichoVocab {
  if (lang === "es") {
    return {
      ...v,
      rotulo: "NEGOCIO LOCAL", em: "sentirte en casa",
      desc: "atención de verdad, como mereces.",
      prep: "el lugar", marquee: "Un lugar para ti", ctaEm: "conocer",
      ctaLabel: "Contactar", servicosLabel: "Servicios",
      servicosTitle: "Elige lo", servicosEm: "tuyo",
      servicosHint: "escríbenos por WhatsApp",
      ofertasTitle: v.ofertasTitle ? "Ofertas" : null,
    };
  }
  return {
    ...v,
    rotulo: "LOCAL BUSINESS", em: "feel at home",
    desc: "quality service, the way you deserve.",
    prep: "the place", marquee: "A place for you", ctaEm: "visit",
    ctaLabel: "Contact us", servicosLabel: "Services",
    servicosTitle: "What we", servicosEm: "offer",
    servicosHint: "message us on WhatsApp",
    ofertasTitle: v.ofertasTitle ? "Offers" : null,
  };
}

interface NichoResult { paleta: string; vocab: NichoVocab | null }

/**
 * Nicho fora do mapa determinístico → a IA classifica usando fotos
 * (descrições da visão), bio e legendas do Instagram. Retorna paleta
 * conhecida (vocab determinístico cuida) ou paleta nova + vocab custom.
 */
async function classifyNichoAI(
  apiKey: string | null,
  lead: Record<string, unknown>,
  ctx: { descs: string[]; captions: string[]; bio?: string | null },
  lang = "pt",
): Promise<NichoResult | null> {
  const classifySystem = nichoClassifySystem(lang);
  const userContent = [
    `Estabelecimento: ${asString(lead.nome, 150) ?? "?"} — categoria: ${asString(lead.categoria, 150) ?? "?"}, ${asString(lead.cidade, 80) ?? ""}`,
    ctx.bio ? `Bio do Instagram: ${asString(ctx.bio, 300)}` : "",
    ctx.descs.length ? `Descrições das fotos reais do lugar:\n${ctx.descs.join("\n")}` : "",
    ctx.captions.length ? `Legendas do Instagram:\n${ctx.captions.slice(0, 6).join("\n---\n")}` : "",
  ].filter(Boolean).join("\n\n");

  let content: unknown = null;
  if (apiKey) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        "HTTP-Referer": optionalEnv("APP_URL") ?? "https://seekerai.digital", "X-Title": "SeekerAi",
      },
      body: JSON.stringify({
        model: TEXT_MODEL, max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: classifySystem },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null) as Record<string, unknown> | null;
      const choices = data && Array.isArray(data.choices) ? data.choices : [];
      content = isRecord(choices[0]) && isRecord(choices[0].message)
        ? choices[0].message.content : null;
    }
  }
  if (typeof content !== "string" || !content.trim()) {
    const f = await orFreeChat(classifySystem, userContent, 900, 30_000);
    const fChoices = f && Array.isArray(f.choices) ? f.choices : [];
    content = isRecord(fChoices[0]) && isRecord(fChoices[0].message)
      ? fChoices[0].message.content : null;
  }
  if (typeof content !== "string" || !content.trim()) {
    const nv = await nvidiaChat(classifySystem, userContent, 900, 30_000);
    const nvChoices = nv && Array.isArray(nv.choices) ? nv.choices : [];
    content = isRecord(nvChoices[0]) && isRecord(nvChoices[0].message)
      ? nvChoices[0].message.content : null;
  }
  if (typeof content !== "string") return null;

  const KNOWN = new Set([
    "beleza", "barbearia", "tattoo", "mercado", "padaria", "trattoria", "cafe", "clinica",
    "studio", "pet", "flora", "carbono", "corporativo", "varejo", "hotel", "educacao",
    "eventos", "acougue", "farmacia", "otica", "assistencia", "auto", "construcao",
    "viagem", "imobiliaria", "arquitetura",
  ]);
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    let paleta = (asString(raw.paleta, 40) ?? "").toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
    if (!paleta) return null;
    if (KNOWN.has(paleta)) return { paleta, vocab: null };
    // Paleta nova → exige vocab completo e sanitizado pra ter coerência.
    const v = isRecord(raw.vocab) ? raw.vocab : null;
    if (!v) return null;
    const cta = ["agendar", "zap", "mapa"].includes(asString(v.cta, 10) ?? "")
      ? asString(v.cta, 10)! as NichoVocab["cta"]
      : "zap";
    const vocab: NichoVocab = {
      rotulo: asString(v.rotulo, 60) ?? "ESTABELECIMENTO LOCAL",
      em: asString(v.em, 60) ?? "se sentir em casa",
      desc: asString(v.desc, 220) ?? "atendimento de verdade, do jeito que você merece.",
      prep: asString(v.prep, 30) ?? "o espaço",
      marquee: asString(v.marquee, 80) ?? "Um lugar pra você",
      ctaEm: asString(v.ctaEm, 40) ?? "conhecer",
      schema: asString(v.schema, 60) ?? "LocalBusiness",
      cta,
      ctaLabel: asString(v.ctaLabel, 40) ?? "Chamar no WhatsApp",
      servicosLabel: asString(v.servicosLabel, 30) ?? "Serviços",
      servicosTitle: asString(v.servicosTitle, 40) ?? "Escolha o seu",
      servicosEm: asString(v.servicosEm, 30) ?? "momento",
      servicosHint: asString(v.servicosHint, 60) ?? "chame pelo WhatsApp",
      ofertasTitle: asString(v.ofertasTitle, 60),
      guia: asString(v.guia, 600)
        ?? "servicos = o que o estabelecimento oferece — duracaoMin só pra serviço com hora marcada.",
    };
    return { paleta, vocab };
  } catch {
    return null;
  }
}

const DOW_NAME: Record<string, string> = {
  domingo: "0", segunda: "1", "segunda-feira": "1", "terça": "2", "terça-feira": "2",
  quarta: "3", "quarta-feira": "3", quinta: "4", "quinta-feira": "4",
  sexta: "5", "sexta-feira": "5", "sábado": "6",
  sunday: "0", monday: "1", tuesday: "2", wednesday: "3", thursday: "4",
  friday: "5", saturday: "6",
  lunes: "1", martes: "2", "miércoles": "3", miercoles: "3", jueves: "4",
  viernes: "5", sabado: "6",
  "lunedì": "1", lunedi: "1", "martedì": "2", martedi: "2",
  "mercoledì": "3", mercoledi: "3", "giovedì": "4", giovedi: "4",
  "venerdì": "5", venerdi: "5", domenica: "0",
  montag: "1", dienstag: "2", mittwoch: "3", donnerstag: "4",
  freitag: "5", samstag: "6", sonntag: "0",
  lundi: "1", mardi: "2", mercredi: "3", jeudi: "4", vendredi: "5",
  samedi: "6", dimanche: "0",
  // Abreviações que o Maps/Serper também devolvem.
  seg: "1", ter: "2", qua: "3", qui: "4", sex: "5", sab: "6", "sáb": "6", dom: "0",
  mon: "1", tue: "2", wed: "3", thu: "4", fri: "5", sat: "6", sun: "0",
  mar: "2", "mié": "3", mie: "3", jue: "4", vie: "5",
  jeu: "4", ven: "5", sam: "6", dim: "0",
};

/** "terça a sábado" / "segunda e domingo" / "sábado, domingo" → chaves de dia. */
function dayKeysFromLabel(day: string): string[] {
  const d = day.toLowerCase().replace(/\s+/g, " ").trim();
  const single = DOW_NAME[d];
  if (single) return [single];
  // Range de dias: "segunda a sexta", "monday to friday", "terça - sábado".
  const range = d.match(/^(.+?)\s+(?:a|à|até|to|until|bis|–|—|-)\s+(.+)$/);
  if (range) {
    const a = DOW_NAME[range[1].trim()];
    const b = DOW_NAME[range[2].trim()];
    if (a && b) {
      const out: string[] = [];
      for (let i = Number(a), guard = 0; guard < 7; i = (i + 1) % 7, guard++) {
        out.push(String(i));
        if (i === Number(b)) break;
      }
      if (out.length <= 7) return out;
    }
  }
  // Lista: "segunda e domingo", "sábado, domingo", "sat & sun".
  const parts = d.split(/\s*(?:,|&| e | and | et | und | y )\s*/);
  const keys = parts.map((p) => DOW_NAME[p.trim()]).filter((k): k is string => Boolean(k));
  return keys;
}

/** Labels reais ("Segunda", "09:00 – 19:00") → mapa de janelas pro booking. */
function horariosFromLabels(
  labels: [string, string][] | undefined,
): Record<string, [string, string][] | null> | undefined {
  if (!labels?.length) return undefined;
  const out: Record<string, [string, string][] | null> = {};
  for (const [day, range] of labels) {
    const windows = parseOpeningHours(range);
    for (const key of dayKeysFromLabel(day)) {
      if (!(key in out)) out[key] = windows;
    }
  }
  // Nenhum dia com janela (tudo fechado/irreconhecível) → sem calendário:
  // deixa o fluxo cair pro CTA de WhatsApp em vez de mostrar dias mortos.
  return Object.values(out).some((w) => w?.length) ? out : undefined;
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

  return [...sources].slice(0, MAX_SITE_IMAGES);
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

interface PlaceReview { autor: string; nota: number; texto: string; quando?: string; foto?: string }
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
  lunes: "1", martes: "2", "miércoles": "3", miercoles: "3", jueves: "4",
  viernes: "5", sabado: "6",
  "lunedì": "1", lunedi: "1", "martedì": "2", martedi: "2",
  "mercoledì": "3", mercoledi: "3", "giovedì": "4", giovedi: "4",
  "venerdì": "5", venerdi: "5", domenica: "0",
  montag: "1", dienstag: "2", mittwoch: "3", donnerstag: "4",
  freitag: "5", samstag: "6", sonntag: "0",
  lundi: "1", mardi: "2", mercredi: "3", jeudi: "4", vendredi: "5",
  samedi: "6", dimanche: "0",
};
const DAY_LABEL: Record<string, Record<string, string>> = {
  pt: { "1": "Segunda", "2": "Terça", "3": "Quarta", "4": "Quinta", "5": "Sexta", "6": "Sábado", "0": "Domingo" },
  en: { "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday", "0": "Sunday" },
  es: { "1": "Lunes", "2": "Martes", "3": "Miércoles", "4": "Jueves", "5": "Viernes", "6": "Sábado", "0": "Domingo" },
  fr: { "1": "Lundi", "2": "Mardi", "3": "Mercredi", "4": "Jeudi", "5": "Vendredi", "6": "Samedi", "0": "Dimanche" },
  de: { "1": "Montag", "2": "Dienstag", "3": "Mittwoch", "4": "Donnerstag", "5": "Freitag", "6": "Samstag", "0": "Sonntag" },
  it: { "1": "Lunedì", "2": "Martedì", "3": "Mercoledì", "4": "Giovedì", "5": "Venerdì", "6": "Sabato", "0": "Domenica" },
};
function dayLabel(key: string, lang: string): string {
  return (DAY_LABEL[lang] ?? DAY_LABEL.en)[key] ?? key;
}
const CLOSED_LABEL: Record<string, string> = {
  pt: "Fechado", en: "Closed", es: "Cerrado", fr: "Fermé", de: "Geschlossen", it: "Chiuso",
};
function closedLabel(lang: string): string {
  return CLOSED_LABEL[lang] ?? "Closed";
}
const OPEN24_LABEL: Record<string, string> = {
  pt: "Aberto 24h", en: "Open 24 hours", es: "Abierto 24h", fr: "Ouvert 24h", de: "24h geöffnet", it: "Aperto 24h",
};
function open24Label(lang: string): string {
  return OPEN24_LABEL[lang] ?? "Open 24 hours";
}

/** "9:00 AM to 7:00 PM" / "08:00–20:00" / "9 AM–7 PM" (e múltiplas janelas) → [["09:00","19:00"], ...]. */
function parseOpeningHours(hours: string): [string, string][] | null {
  // Google usa espaços unicode (nbsp, narrow nbsp) nos labels localizados.
  const norm = hours.replace(/[\u00A0\u2009\u202F]/g, " ").trim();
  if (/closed|fechad|cerrad|fermé|geschlossen|chiuso|permanent/i.test(norm)) return null;
  if (/24\s*(hours?|horas|heures|hrs?|h)\b/i.test(norm) && !/\d{1,2}\s*[:.]\s*\d{2}/.test(norm)) {
    return [["00:00", "23:59"]];
  }
  const to24 = (h: string, m: string | undefined, ap: string | undefined) => {
    let hh = Number(h);
    const mm = m ?? "00";
    if (ap) {
      const pm = ap.replace(/\./g, "").toUpperCase() === "PM";
      if (pm && hh < 12) hh += 12;
      if (!pm && hh === 12) hh = 0;
    }
    return `${String(hh).padStart(2, "0")}:${mm}`;
  };
  const out: [string, string][] = [];
  // Separadores reais que chegam do Maps/Serper: "to", "às", "a",
  // "até", "until", "bis" e os traços – — -.
  const re = /(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:to|às|até|until|bis|a\b|–|—|-)\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) out.push([to24(m[1], m[2], m[3]), to24(m[4], m[5], m[6])]);
  return out.length ? out : null;
}


/** Extrai @ do HTML de um site (barato — uma requisição). */
async function instagramFromWebsite(url: string): Promise<string | undefined> {
  if (!/^https?:\/\//i.test(url)) return undefined;
  if (url.match(/instagram\.com\//i)) {
    const h = url.match(/instagram\.com\/(?:p\/)?([A-Za-z0-9._%]+)/i)?.[1];
    return h ? `@${h}` : undefined;
  }
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; SeekerAI/1.0)" },
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!res?.ok) return undefined;
  const html = (await res.text().catch(() => "")).slice(0, 250_000);
  const m = html.match(/instagram\.com\/(?:p\/)?([A-Za-z0-9._%]{1,40})/i);
  const h = m?.[1];
  if (!h || /^(p|tv|reel|reels|explore|accounts|embed|share|oauth)$/i.test(h)) return undefined;
  return `@${h}`;
}


/**
 * Dados do Maps via Serper — reviews, horários e foto do lugar.
 * /reviews devolve texto, data em pt-BR e thumbnail do avaliador;
 * /maps (só quando o lead não guarda cid) resolve o cid e traz
 * horários/rating do estabelecimento (~$0.002 a dupla chamada).
 */
interface SerperDetails {
  reviews: PlaceReview[];
  horariosLabel: [string, string][];
  imageUrls: string[];
  avaliacao?: number;
  totalAvaliacoes?: number;
}

async function fetchSerperReviews(lead: Record<string, unknown>, lang = "pt"): Promise<SerperDetails> {
  const empty: SerperDetails = { reviews: [], horariosLabel: [], imageUrls: [] };
  // Principal + reservas (_2.._7): se uma chave falhar (cota/rate
  // limit) a próxima responde a mesma requisição.
  // Só as chaves com crédito — _1.._4 estão sem saldo no Serper.
  const keys = [
    await getSecret("SERPER_API_KEY_5"),
    await getSecret("SERPER_API_KEY_6"),
    await getSecret("SERPER_API_KEY_7"),
  ].filter((k): k is string => Boolean(k));
  if (!keys.length) return empty;
  const gl = (leadPais(lead) ?? "BR").toLowerCase();
  const post = async (path: string, body: Record<string, unknown>) => {
    for (const key of keys) {
      const r = await fetch(`https://google.serper.dev${path}`, {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, gl, hl: placesLang(lang) }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      if (r?.ok) return await r.json().catch(() => null);
    }
    return null;
  };
  // /reviews só aceita cid numérico — lead vindo de busca Serper já guarda
  // cid; lead com placeId ChIJ resolve o cid via busca por nome+cidade.
  const placeId = asString(lead.place_id, 300);
  let cid = placeId && /^\d+$/.test(placeId) ? placeId : null;
  let hit: Record<string, unknown> | null = null;
  if (!cid) {
    const nome = asString(lead.nome, 150);
    const cidade = [asString(lead.cidade, 80), asString(lead.uf, 4)].filter(Boolean).join(" ");
    if (!nome) return empty;
    const m = await post("/maps", { q: `${nome} ${cidade}`.trim(), num: 3 });
    const places = isRecord(m) && Array.isArray(m.places) ? m.places : [];
    // match pelo endereço quando o lead tem; senão primeiro resultado.
    const endereco = (asString(lead.endereco, 300) ?? "").toLowerCase();
    hit = (places.filter(isRecord).find((p) => {
      const a = (asString(p.address, 300) ?? "").toLowerCase();
      const rua = endereco.split(",")[0]?.trim();
      return rua && a.includes(rua.slice(0, 12));
    }) ?? places[0]) as Record<string, unknown> | undefined ?? null;
    cid = hit ? asString(hit.cid, 40) : null;
  }
  if (!cid) return empty;

  // Horários vêm junto no place, no idioma pedido via hl — as chaves do
  // objeto openingHours são os nomes de dia localizados.
  const DAY_ORDER: Record<string, string[]> = {
    pt: ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"],
    en: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    es: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    fr: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    de: ["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"],
    it: ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
  };
  const days = DAY_ORDER[lang] ?? DAY_ORDER.en;
  const oh = hit && isRecord(hit.openingHours) ? hit.openingHours : null;
  const horariosLabel: [string, string][] = oh
    ? days.flatMap((d): [string, string][] => {
      const h = asString(oh[d], 120);
      return h ? [[d[0].toUpperCase() + d.slice(1), h]] : [];
    })
    : [];

  const data = await post("/reviews", { cid, num: 10 });
  const reviews = (isRecord(data) && Array.isArray(data.reviews) ? data.reviews : [])
    .slice(0, 6).flatMap((r): PlaceReview[] => {
      if (!isRecord(r)) return [];
      const texto = asString(r.snippet, 500);
      if (!texto || texto.length < 12) return [];
      const user = isRecord(r.user) ? r.user : {};
      return [{
        autor: asString(user.name, 80) ?? "Cliente",
        nota: typeof r.rating === "number" ? r.rating : 5,
        texto,
        quando: asString(r.date, 40) ?? undefined,
        foto: asString(user.thumbnail, 800) ?? undefined,
      }];
    });
  // Thumbnail real do lugar no Maps — re-hospedada junto com as demais.
  const thumb = hit ? asString(hit.thumbnailUrl, 1200) : null;
  return {
    reviews,
    horariosLabel,
    imageUrls: thumb ? [thumb] : [],
    avaliacao: hit && typeof hit.rating === "number" ? hit.rating : undefined,
    totalAvaliacoes: hit && typeof hit.ratingCount === "number" ? hit.ratingCount : undefined,
  };
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
 * Scraper de Instagram via ScrapeCreators — pega posts do @ do lead:
 * imagens (displayUrl/sidecar), vídeos (videoUrl/reels) e legendas.
 * As legendas viram contexto pra IA (serviços/diferenciais reais) e
 * a mídia real re-hospedada popula galeria e reels do site.
 */
async function fetchInstagramMedia(handleOrUrl: string | null | undefined): Promise<IgMedia | null> {
  const raw = handleOrUrl;
  if (!raw) return null;
  const handle = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1] ?? raw.replace(/^@/, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9._]{1,60}$/.test(handle)) return null;

  // Fonte única: cache (7d) + ScrapeCreators.
  try {
    const sc = await igMediaCached(handle);
    if (sc && (sc.images.length || sc.videos.length || sc.captions.length)) {
      const media: IgMedia = {
        images: sc.images.slice(0, 8),
        videos: sc.videos.slice(0, 3),
        captions: sc.captions.slice(0, 10),
      };
      return media;
    }
    if (sc) return { images: [], videos: [], captions: [], erro: "sem-midia" };
  } catch { /* sem chave/erro de rede → segue com cache vazio */ }
  return { images: [], videos: [], captions: [], erro: "indisponivel" };
}

/** Upload pro bucket público site-assets, com retry — Storage falha intermitente. */
async function uploadSiteAsset(
  db: ReturnType<typeof serviceClient>,
  slug: string,
  name: string,
  body: Uint8Array,
  contentType: string,
): Promise<string | null> {
  const base = `${process.env.SUPABASE_URL}/storage/v1/object/public/site-assets`;
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
  tipo: string,
  visualRef?: string | null,
  pais?: string | null,
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
    buffet: "catering and events venue", "salão de festas": "event venue",
    "salao de festas": "event venue", eventos: "event venue", sorveteria: "ice cream shop",
    igreja: "church", funerária: "funeral home",
    açougue: "butcher shop", acougue: "butcher shop",
    ótica: "eyewear store", otica: "eyewear store",
    "assistência técnica": "electronics repair shop", "assistencia tecnica": "electronics repair shop",
    borracharia: "tire shop", imobiliária: "real estate office", imobiliaria: "real estate office",
    "agência de viagens": "travel agency", "agencia de viagens": "travel agency",
  };
  const catKey = (lead.categoria ?? "").toLowerCase().trim();
  const catEn = CAT_EN[catKey] ?? CAT_EN[catKey.replace(/\s*-\s*.*/, "")] ?? lead.categoria ?? "local business";
  // Nem nome nem cidade no texto do prompt: qualquer substantivo próprio
  // vira letreiro/marca d'água na imagem gerada.
  const adj = pais ? COUNTRY_ADJ[pais] : "Brazilian";
  const biz = adj ? `a ${adj} ${catEn}` : `a ${catEn}`;
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
    eventos: "elegant event venue look, warm golden evening light, decorated tables with floral centerpieces, festive celebratory atmosphere",
    acougue: "artisanal butcher shop look, deep burgundy and warm wood tones, fresh meat display, rustic market lighting",
    farmacia: "clean pharmacy look, fresh white and soft green tones, organized shelves, bright sanitary lighting",
    otica: "sleek eyewear boutique look, steel blue and warm grey tones, glasses display on clean shelves, modern retail lighting",
    assistencia: "electronics repair lab look, cool blue and graphite tones, tools and circuit boards, focused workbench lighting",
    auto: "professional auto repair look, graphite and safety orange tones, clean workshop with tools, industrial lighting",
    construcao: "construction and renovation look, warm terracotta and sand tones, skilled workers finishing interiors, work site light",
    viagem: "bright travel agency look, sky blue and sandy tones, destination posters and world map accents, optimistic daylight",
    imobiliaria: "upscale real estate look, deep navy and brass tones, modern property interiors, confident professional lighting",
    arquitetura: "minimal architecture studio look, graphite and copper tones, drafting tables and material samples, directional light",
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
  // wa.me exige DDI do país do estabelecimento — nunca "+55" cego.
  const cc = callingCodeFor(leadPais(lead));
  const whatsapp = lead.whatsapp === "sim" || dados.whatsapp === true
    ? toE164(telefone, cc) : undefined;
  return {
    tipo,
    nome: asString(lead.nome, 150) ?? "Estabelecimento",
    marca: asString(lead.nome, 150) ?? "Estabelecimento",
    pais: leadPais(lead) ?? undefined,
    cidade: cidade || undefined,
    contato: {
      telefone: telefone ?? undefined,
      whatsapp: whatsapp || undefined,
      instagram: instagram
        ? (() => {
            // "@user" | "user" | URL completa → handle → URL canônica.
            const m = instagram.match(/instagram\.com\/(?:p\/)?([A-Za-z0-9_.]+)/i);
            const h = (m ? m[1] : instagram.replace(/^@+/, "")).replace(/\/+$/, "");
            return /^[A-Za-z0-9_.]{1,30}$/.test(h) ? `https://instagram.com/${h}` : undefined;
          })()
        : undefined,
      endereco: asString(lead.endereco, 300) ?? undefined,
      mapsUrl: asString(lead.maps_url, 800) ?? asString(dados.mapsUrl, 800) ?? undefined,
    },
    // Horários: só reais — salvos na busca (dados.horariosLabel) ou
    // rebuscados do Maps na geração. Nunca fabricados.
    horariosLabel: (Array.isArray(dados.horariosLabel) ? dados.horariosLabel : [])
      .flatMap((p): [string, string][] => {
        if (!Array.isArray(p) || p.length !== 2) return [];
        const d = asString(p[0], 60); const h = asString(p[1], 120);
        return d && h ? [[d, h]] : [];
      }),
    servicos: [],
    avaliacoes: typeof lead.avaliacao === "number"
      ? { nota: lead.avaliacao, total: typeof lead.total_avaliacoes === "number" ? lead.total_avaliacoes : 0, fonte: "Google" }
      : undefined,
    booking: { slotMin: 30, diasFuturos: 14, antecedenciaMin: 30 },
    seo: { title: asString(lead.nome, 150) ?? undefined, description: asString(lead.endereco, 200) ?? undefined },
  };
}

/** Sanitiza o patch de IA — aceita só campos conhecidos, com tetos.
    `sourceText` = material real (legendas/bio) — preço só sobrevive se o
    número constar lá; sem isso o modelo inventaria valores no site. */
function sanitizeConfigPatch(raw: unknown, sourceText = ""): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const patch: Record<string, unknown> = {};
  const str = (v: unknown, max = 200) => asString(v, max) ?? undefined;
  // "45", "R$ 45", "45,00", "45 reais" — o inteiro tem que aparecer no material.
  const precoCitado = (v: unknown) =>
    typeof v === "number" && v > 0 && v < 100_000
    && new RegExp(`\\b${Math.trunc(v)}\\b`).test(sourceText)
      ? Math.round(v * 100) / 100 : null;

  patch.tagline = str(raw.tagline, 120);
  if (Array.isArray(raw.servicos)) {
    patch.servicos = raw.servicos.filter(isRecord).slice(0, 12).map((s) => {
      const preco = precoCitado(s.preco);
      const precoDe = precoCitado(s.precoDe);
      return {
        nome: str(s.nome, 80) ?? "Serviço",
        duracaoMin: typeof s.duracaoMin === "number" && s.duracaoMin >= 10 && s.duracaoMin <= 480
          ? Math.round(s.duracaoMin) : null,
        preco,
        // "de R$80 por R$68" — preço cheio só se citado e maior que o atual.
        precoDe: preco !== null && precoDe !== null && precoDe > preco ? precoDe : null,
        categoria: str(s.categoria, 60),
        descricao: str(s.descricao, 200),
        badge: str(s.badge, 26) ?? null,
        // Índice da foto real descrita pela visão — resolvido pra URL
        // depois que as fotos terminam de subir.
        foto: typeof s.foto === "number" && Number.isInteger(s.foto) && s.foto >= 0 ? s.foto : null,
      };
    }).filter((s) => s.nome !== "Serviço");
    if (!(patch.servicos as unknown[]).length) delete patch.servicos;
  }
  // Equipe real: nomes/cargos que a IA extraiu da bio e legendas —
  // monograma + selo de cargo no site; nunca inventada (regra no prompt).
  if (Array.isArray(raw.profissionais)) {
    const p = raw.profissionais.filter(isRecord).slice(0, 8).map((x) => ({
      nome: str(x.nome, 80) ?? "",
      cargo: str(x.cargo, 40),
      especialidade: str(x.especialidade, 80),
    })).filter((x) => x.nome);
    if (p.length) patch.profissionais = p;
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
  if (Array.isArray(raw.ofertas)) {
    const o = raw.ofertas.filter(isRecord).slice(0, 6).map((x) => ({
      titulo: str(x.titulo, 80) ?? "",
      texto: str(x.texto, 200),
      tag: str(x.tag, 40),
    })).filter((x) => x.titulo);
    if (o.length) patch.ofertas = o;
  }
  if (isRecord(raw.seo)) {
    const desc = str(raw.seo.description, 160);
    if (desc) patch.seo = { description: desc };
  }
  // vocab traduzido/adaptado pela IA pro idioma do site — cta/schema/guia
  // não passam pelo modelo, ficam com os valores determinísticos.
  if (isRecord(raw.vocab)) {
    const v = raw.vocab;
    const vocab: Record<string, unknown> = {};
    for (const k of ["rotulo", "em", "desc", "prep", "marquee", "ctaEm", "ctaLabel",
      "servicosLabel", "servicosTitle", "servicosEm", "servicosHint"] as const) {
      const s = str(v[k], 220);
      if (s) vocab[k] = s;
    }
    if (typeof v.ofertasTitle === "string" && v.ofertasTitle.trim()) {
      vocab.ofertasTitle = str(v.ofertasTitle, 60);
    } else if (v.ofertasTitle === null) {
      vocab.ofertasTitle = null;
    }
    if (Object.keys(vocab).length) patch.vocab = vocab;
  }
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
  return patch;
}

function configPatchSystem(lang: string): string {
  const L = langName(lang);
  return [
    "Você é um diretor de arte e copywriter sênior montando o SiteConfig JSON de um site premium.",
    "Responda APENAS com JSON válido (sem markdown, sem comentários) neste formato exato:",
    '{ "tagline": "frase curta de marca",',
    '  "servicos": [{"nome":"…","categoria":"…","descricao":"…","duracaoMin":null,"preco":null,"precoDe":null,"badge":null,"foto":null}],',
    '  "profissionais": [{"nome":"…","cargo":"…","especialidade":"…"}],',
    '  "historia": {"titulo":"…","paragrafos":["…","…"]}, "diferenciais":["…"],',
    '  "ofertas": [{"titulo":"…","texto":"…","tag":"OFERTA"}],',
    '  "faq":[{"q":"…","a":"…"}], "seo":{"description":"…"}',
    lang === "pt" ? "}" : ',  "vocab":{"rotulo":"…","em":"…","desc":"…","prep":"…","marquee":"…","ctaEm":"…","ctaLabel":"…","servicosLabel":"…","servicosTitle":"…","servicosEm":"…","servicosHint":"…","ofertasTitle":"… ou null"} }',
    "REGRAS:",
    "- Use SOMENTE os fatos dados (nome, categoria, cidade, avaliações, serviços citados, legendas do Instagram). Não invente preços, profissionais, prêmios ou números.",
    "- Siga o GUIA DO NICHO enviado junto com os fatos — ele define o que 'servicos' representa nesse negócio (cardápio, setores, tratamentos…) e se duracaoMin deve ser null.",
    "- Se os serviços reais não estiverem claros, proponha 4-8 itens típicos da categoria, respeitando o guia do nicho, e preco SEMPRE null.",
    "- preco/precoDe: número SOMENTE se o valor estiver literalmente escrito no material (legenda, bio, panfleto — 'de R$80 por R$68'). Sem citação explícita → null. precoDe é o preço cheio riscado (maior que preco).",
    "- foto: quando a lista FOTOS REAIS vier nos fatos, aponte o ÍNDICE da foto que melhor representa o serviço (ex.: foto de um corte → serviço 'Corte'). Só quando o casamento for claro — senão null. No máximo 4 serviços com foto, os mais vendáveis.",
    "- badge: selo curto em MAIÚSCULAS (máx 2 serviços) tipo 'MAIS PEDIDO' ou 'MELHOR CUSTO' — só quando o material sustentar (serviço mais citado nos posts/reviews, combo com desconto real). Sem evidência → null.",
    "- profissionais: SÓ quando nomes reais aparecerem na bio ou legendas ('@joao barbeiro', 'equipe: Maria e Ana', 'dono @x'). cargo = papel em MAIÚSCULAS ('DONO','BARBEIRO','TATUADORA'). especialidade = nicho curto ('fades','coloração'). Sem nomes reais → omita o campo.",
    "- ofertas: SÓ preencha quando o material real (legendas/fotos do Instagram) mostrar promoções, panfletos, combos, pacotes ou campanhas — ex.: panfleto de mercado, happy hour, combo de banho+tosa. tag é um selo curto ('OFERTA DA SEMANA', 'COMBO'). Sem material promocional, omita o campo. Nunca invente preço ou validade; pode mencionar valores apenas se estiverem escritos nas legendas.",
    "- tagline: elegante, max 8 palavras, no tom do negócio.",
    "- historia: 2 parágrafos acolhedores sobre a proposta do lugar — sem inventar datas/fatos; pode falar de proposta e experiência, não de biografia.",
    "- faq: 4-6 perguntas práticas ADAPTADAS ao nicho (o guia diz quais temas fazem sentido — entrega, estacionamento, matrícula, orçamento… nunca agendamento quando o negócio não agenda).",
    "- seo.description: 1 frase com nome + categoria + cidade.",
    ...(lang === "pt" ? [] : [
      `- O site será exibido em ${L}. Escreva TODO o texto em ${L} — nada em português.`,
      `- vocab: o VOCAB BASE enviado nos fatos está em português como referência de SEMÂNTICA. Devolva cada campo adaptado naturalmente a ${L} e ao nicho — prep mantém artigo+substantivo ("the studio", "el mercado"); servicosHint é o microcopy do card; ofertasTitle null se o VOCAB BASE for null.`,
    ]),
    `- Todo o texto em ${L}, sem emojis.`,
  ].join("\n");
}

async function configPatchFromAi(
  apiKey: string | null,
  lead: Record<string, unknown>,
  extraFacts?: string,
  lang = "pt",
): Promise<{ patch: Record<string, unknown>; modelo: string }> {
  const facts = {
    nome: lead.nome, categoria: lead.categoria, cidade: lead.cidade, uf: lead.uf,
    endereco: lead.endereco, avaliacao: lead.avaliacao, totalAvaliacoes: lead.total_avaliacoes,
    instagram: lead.instagram, temWhatsApp: lead.whatsapp === "sim",
    pais: leadPais(lead), idiomaSite: langName(lang),
  };
  const userContent = `Estabelecimento:\n${JSON.stringify(facts)}${extraFacts ?? ""}`;
  const system = configPatchSystem(lang);

  // OpenRouter primeiro; NVIDIA gratuita se falhar ou não houver chave.
  let content: unknown = null;
  let modelo = PATCH_MODEL;
  let orStatus = 0;
  if (apiKey) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        "HTTP-Referer": optionalEnv("APP_URL") ?? "https://seekerai.digital", "X-Title": "SeekerAi",
      },
      body: JSON.stringify({
        model: PATCH_MODEL,
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null);
    orStatus = res?.status ?? 0;
    if (res?.ok) {
      const data = await res.json().catch(() => null) as Record<string, unknown> | null;
      const choices = data && Array.isArray(data.choices) ? data.choices : [];
      content = isRecord(choices[0]) && isRecord(choices[0].message)
        ? choices[0].message.content : null;
    } else {
      console.error("[site-config] openrouter falhou:", orStatus || "network");
    }
  }
  // Qualquer falha do OpenRouter (rede, 402, 5xx, vazio) tenta o modelo
  // ":free" do OR e depois a NVIDIA — patch vazio só degrada o site,
  // nunca mata a geração.
  if (typeof content !== "string" || !content.trim()) {
    const f = await orFreeChat(system, userContent, 3000, 40_000);
    const fChoices = f && Array.isArray(f.choices) ? f.choices : [];
    const fContent = isRecord(fChoices[0]) && isRecord(fChoices[0].message)
      ? fChoices[0].message.content : null;
    if (typeof fContent === "string" && fContent.trim()) {
      content = fContent;
      modelo = OR_FREE_TEXT_MODEL;
      console.log("[site-config] respondido via OpenRouter :free");
    }
  }
  if (typeof content !== "string" || !content.trim()) {
    // Uma falha transitória não deve derrubar o patch — uma retentativa.
    for (let t = 0; t < 2; t++) {
      const nv = await nvidiaChat(system, userContent, 3000, 45_000);
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
        extraFacts ?? "",
      ),
      modelo,
    };
  } catch {
    return { patch: {}, modelo: "base" };
  }
}

/** Card HTML que vai pro lead_outputs — o workspace renderiza em iframe. */
function siteCardHtml(slug: string, nome: string, hero: string | null, lang = "pt"): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  const htmlLang = { pt: "pt-BR", en: "en", es: "es" }[lang] ?? lang;
  return `<!doctype html><html lang="${htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
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
  onStep?: (pct: number, etapa: string) => void,
): Promise<{ slug: string; nome: string; lang: string; siteUrl: string; hero: string | null; modelo: string; geradas: number; reais: number; imagemErros: string[]; debug: Record<string, unknown> }> {
  const { data: lead } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) throw httpError(404, "Lead não encontrado");
  onStep?.(15, "Analisando o estabelecimento");

  const dados = isRecord(lead.dados) ? lead.dados : {};
  const nome = asString(lead.nome, 150) ?? "estabelecimento";
  // Idioma do site deriva do país do estabelecimento (lead.pais vem do
  // Maps na busca). Tudo downstream — copy, vocab, horários, reviews —
  // respeita esse idioma, nunca o do usuário da plataforma.
  const siteLang = siteLangFor(lead);
  const { tipo, paleta: paleta0 } = siteThemeFor(asString(lead.categoria, 150));
  let paleta = paleta0;
  // Nicho fora do mapa (paleta "generico") → a IA classifica a partir de
  // fotos+bio+legendas e pode devolver um vocabulário custom inteiro.
  // O patch espera a resolução via promise pra usar o vocab certo no guia.
  let nichoResolve: (v: NichoResult | null) => void = () => {};
  const nichoPromise = new Promise<NichoResult | null>((r) => { nichoResolve = r; });
  let resolvedVocab: NichoVocab | null = null;

  // Slug: o do lead se já existir (sanitizado — um valor legado
  // fora do padrão derrubava o insert); senão nome+bairro/cidade.
  let slug = dados.siteSlug
    ? slugify(asString(dados.siteSlug, 120) ?? "")
    : slugify([nome, asString(lead.bairro, 80) ?? asString(lead.cidade, 80)].filter(Boolean).join(" "));
  const { data: owner } = await db.from("sites").select("lead_id").eq("slug", slug).maybeSingle();
  if (owner && owner.lead_id !== leadId) {
    // Base com folga pro sufixo "-NN" ficar dentro dos 61 chars.
    const base = slug.slice(0, 57).replace(/-+$/g, "");
    for (let i = 2; i < 20; i++) {
      slug = `${base}-${i}`;
      const { data: clash } = await db.from("sites").select("slug").eq("slug", slug).maybeSingle();
      if (!clash) break;
    }
  }

  await ensureSiteBucket(db);
  onStep?.(30, "Coletando Maps e Instagram");

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Reviews/horários/foto do Maps vêm SÓ do Serper — sem Apify nem
  // Google Places. Instagram sai do @ do lead ou do HTML do site.
  const placePromise = (async () => {
    const sp = await fetchSerperReviews(lead, siteLang);
    const site = asString(lead.site, 500);
    const instagram = asString(lead.instagram, 300)
      ?? (site ? await instagramFromWebsite(site) : undefined);
    return {
      reviews: sp.reviews,
      imageUrls: sp.imageUrls,
      instagram,
      horarios: undefined,
      horariosLabel: sp.horariosLabel.length ? sp.horariosLabel : undefined,
      avaliacao: sp.avaliacao,
      totalAvaliacoes: sp.totalAvaliacoes,
    };
  })();
  // Instagram: o @ do lead (vem do Serper) dispara o scrape já; sem @,
  // o placePromise já procurou no HTML do site.
  const igPromise = (async () => {
    let handle = asString(lead.instagram, 300) ?? null;
    if (!handle) {
      const place = await placePromise;
      handle = place.instagram ?? null;
      if (handle) {
        await db.from("leads").update({ instagram: handle }).eq("id", leadId).is("instagram", null);
      }
    }
    return handle ? fetchInstagramMedia(handle) : null;
  })();

  // Descrições de visão das fotos reais — começam cedo pra entrar no
  // prompt do redator (o campo servicos[].foto aponta o índice dessas
  // fotos) e alimentar o accent + referência visual do gap-fill.
  let descsPromise: Promise<{ i: number; d: string | null }[]> | null = null;

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
    // Nicho resolvido (determinístico ou IA) — espera até 50s pela
    // classificação do nicho genérico; sem resposta usa o vocabulário neutro.
    const nicho = await Promise.race([nichoPromise, sleep(50_000).then(() => null)]);
    const vocab = nicho?.vocab
      ?? nicheVocab(nicho?.paleta ?? paleta, asString(lead.categoria, 150));
    // Fotos reais descritas pela visão — o redator casa cada serviço à
    // foto certa pelo índice (card de destaque com foto, estilo Porem).
    const descsNow = descsPromise as Promise<{ i: number; d: string | null }[]> | null;
    const fotos = descsNow
      ? (await Promise.race([descsNow, sleep(50_000).then(() => [] as { i: number; d: string | null }[])]))
        .filter((x) => x.d)
      : [];
    const extra = [
      `GUIA DO NICHO (${vocab.rotulo}): ${vocab.guia}`,
      siteLang === "pt" ? "" : `VOCAB BASE (traduza/adapte cada campo pro idioma do site no campo "vocab" da resposta): ${JSON.stringify({ rotulo: vocab.rotulo, em: vocab.em, desc: vocab.desc, prep: vocab.prep, marquee: vocab.marquee, ctaEm: vocab.ctaEm, ctaLabel: vocab.ctaLabel, servicosLabel: vocab.servicosLabel, servicosTitle: vocab.servicosTitle, servicosEm: vocab.servicosEm, servicosHint: vocab.servicosHint, ofertasTitle: vocab.ofertasTitle })}`,
      facts.length ? `Dados reais do Instagram:\n${facts.join("\n")}` : "",
      captions ? `Legendas reais do Instagram do estabelecimento (use pra inferir serviços, ofertas, diferenciais e o tom da marca — nunca cite nomes de clientes):\n${captions}` : "",
      fotos.length ? `FOTOS REAIS do estabelecimento (índice: descrição da visão) — use o índice no campo "foto" do serviço que a foto representa:\n${fotos.map((x) => `FOTO[${x.i}]: ${x.d}`).join("\n")}` : "",
      ig?.videos?.length ? `O perfil tem ${ig.videos.length} reels/vídeos recentes — se as legendas indicarem bastidores/produção, a seção de história pode mencionar esse processo.` : "",
    ].filter(Boolean).join("\n\n");
    return configPatchFromAi(apiKey, lead, extra ? `\n${extra}` : "", siteLang);
  })();

  // 1) Imagens reais: baixa e re-hospeda (URLs de terceiros expiram).
  const sources = await resolveLeadImageSources(lead, context);
  // Instagram é bonus — não pode segurar o pipeline. Com @ no lead o
  // scrape é direto; sem @ a descoberta social pode demorar mais.
  const igCap = lead.instagram ? 60_000 : 125_000;
  const ig = await Promise.race([igPromise, sleep(igCap).then(() => null)]);
  // Instagram PRIMEIRO: conteúdo real do negócio (posts, carrosséis,
  // reels) tem prioridade sobre fotos genéricas de Maps/site — é o que
  // faz o site parecer do próprio negócio em vez de stock.
  const igImages = (ig?.images ?? []).slice(0, 6);
  const igVideos = ig?.videos ?? [];
  if (igImages.length || igVideos.length) {
    onStep?.(48, `Reaproveitando ${igImages.length} ${igImages.length === 1 ? "imagem" : "imagens"}${igVideos.length ? ` e ${igVideos.length} ${igVideos.length === 1 ? "vídeo" : "vídeos"}` : ""} reais do Instagram`);
  }
  const merged = [...igImages];
  for (const u of sources) {
    if (merged.length < MAX_SITE_IMAGES && !merged.includes(u)) merged.push(u);
  }
  // Foto de perfil do Instagram (raspada na busca) — logo/fachada real.
  const igFoto = ((lead.dados as Record<string, unknown> | null)?.ig as
    { foto?: string | null } | undefined)?.foto;
  if (igFoto && merged.length < MAX_SITE_IMAGES && !merged.includes(igFoto)) {
    merged.push(igFoto);
  }
  const imgSources = merged;
  // Descreve até 6 fotos reais em paralelo com os downloads — o redator
  // usa a lista "FOTO[i]" pra casar serviço↔foto (i = índice em sources).
  descsPromise = Promise.all(
    imgSources.slice(0, 6).map((u, i) =>
      describeReferenceImage(apiKey, u).then((d) => ({ i, d })),
    ),
  );
  // src = índice em sources — o "foto" do patch aponta pro índice de
  // source e precisa sobreviver a downloads que falham (sem shift).
  const publicUrls: { url: string; real: boolean; src: number }[] = [];
  {
    const downloads = await Promise.all(imgSources.map(fetchImageBytes));
    let i = 0, src = -1;
    for (const dl of downloads) {
      src++;
      if (!dl) continue;
      const ext = dl.contentType.includes("png") ? "png" : dl.contentType.includes("webp") ? "webp" : "jpg";
      const url = await uploadSiteAsset(db, slug, `real-${++i}.${ext}`, dl.bytes, dl.contentType);
      if (url) publicUrls.push({ url, real: true, src });
    }
  }

  const descPairs = (await descsPromise) ?? [];
  const descs = descPairs.filter((x): x is { i: number; d: string } => Boolean(x.d)).map((x) => x.d);
  const cores = accentFromDescriptions(descs);
  onStep?.(50, publicUrls.length
    ? `Reunindo ${publicUrls.length} imagens reais do negócio`
    : "Nenhuma foto real encontrada — a IA vai criar as imagens");

  // Nicho não mapeado (paleta "generico") → IA decide a partir das fotos,
  // bio e legendas — pode votar numa paleta conhecida ou criar vocab novo.
  if (paleta === "generico") {
    const igBio = ((lead.dados as Record<string, unknown> | null)?.ig as
      { bio?: string | null } | undefined)?.bio;
    try {
      const nicho = await classifyNichoAI(apiKey, lead, {
        descs, captions: ig?.captions ?? [], bio: igBio,
      }, siteLang);
      if (nicho) {
        paleta = nicho.paleta;
        resolvedVocab = nicho.vocab;
      }
      nichoResolve(nicho);
    } catch {
      nichoResolve(null);
    }
  } else {
    nichoResolve(null);
  }

  // 2) Gap-fill com IA — prompt específico por slot, direção de arte do tema.
  // Reels do Instagram contam como cobertura visual: perfil com feed
  // movimentado (fotos + vídeos) não precisa de imagem gerada pra "encher".
  const imgErrors: string[] = [];
  const coberturaReal = publicUrls.length + Math.min(igVideos.length, 2);
  const faltando = Math.max(0, Math.min(SITE_IMAGE_TARGET - coberturaReal, MAX_GENERATED_IMAGES));
  if (!faltando && (igImages.length || igVideos.length)) {
    onStep?.(55, "Imagens e vídeos reais do Instagram cobrem o site — sem geração de imagem");
  }
  if (faltando > 0) {
    const visualRef = descs.join(" ").slice(0, 700).trim() || null;

    const prompts = siteAssetPrompts(
      { nome, categoria: asString(lead.categoria, 150), cidade: asString(lead.cidade, 80) },
      tipo === "barbearia" ? "barbearia" : paleta, visualRef, leadPais(lead),
    ).slice(0, faltando);
    onStep?.(55, `Escrevendo textos e gerando ${prompts.length} ${prompts.length === 1 ? "imagem" : "imagens"} com IA`);
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
      if (url) publicUrls.push({ url, real: false, src: -1 });
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
  onStep?.(75, "Organizando avaliações, vídeos e mapas");
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
  config.lang = siteLang;
  const { patch, modelo } = await patchPromise;
  // patch.vocab (campos traduzidos) é merge no vocab determinístico mais
  // adiante — sai do assign pra não ser sobrescrito pelo nicheVocab.
  const patchVocab = isRecord(patch.vocab) ? patch.vocab : null;
  delete patch.vocab;
  Object.assign(config, patch);
  if (patch.seo) config.seo = { ...(isRecord(config.seo) ? config.seo : {}), ...patch.seo };
  // IA fora do ar/timeout → serviços padrão do nicho, a seção nunca fica vazia.
  if (!Array.isArray(config.servicos) || !config.servicos.length) {
    config.servicos = defaultServicos(paleta, siteLang);
  }
  const realPhotos = publicUrls.filter((x) => x.real).map((x) => x.url);
  const genPhotos = publicUrls.filter((x) => !x.real).map((x) => x.url);
  config.fotos = {
    hero: realPhotos[0] ?? genPhotos[0],
    galeria: [...realPhotos.slice(1), ...placeImgs, ...genPhotos],
  };
  // servicos[].foto vem do patch como índice na lista FOTOS REAIS
  // (sources) — resolve pra URL re-hospedada; índice inválido vira null
  // e o serviço cai no card de texto normal.
  if (Array.isArray(config.servicos)) {
    const bySrc = new Map(publicUrls.map((x) => [x.src, x.url]));
    for (const s of config.servicos as Record<string, unknown>[]) {
      s.foto = typeof s.foto === "number" ? bySrc.get(s.foto) ?? null : null;
    }
  }
  // Tema: paleta do nicho + variante de layout (3 composições — sites
  // não ficam clones) + cores extraídas das fotos reais do lugar.
  // variantSeed rota a variante: a "nova versão" (regeneração) sai com
  // outro layout em vez de repetir a composição anterior.
  const variants = ["a", "b", "c"] as const;
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const seed = typeof context.variantSeed === "number" && Number.isFinite(context.variantSeed)
    ? Math.trunc(context.variantSeed)
    : 0;
  // Nova versão = outra identidade visual DE VERDADE: o matiz gira em
  // TODAS as variáveis do tema (fundo, painéis, texto, acento) — não só
  // no accent como antes. A paleta do nicho e o contraste se preservam.
  const shift = seed * 67;
  let coresV: Record<string, string | undefined> | null = null;
  if (seed > 0) {
    const [bg, bg2, panel, panel2, text, muted, acc, acc2, accInk, espresso] =
      siteSchemeFor(tipo === "barbearia" ? "barbearia" : paleta);
    coresV = {
      // Com foto real, o accent mantém a identidade do lugar girada;
      // sem foto, vem do esquema-base da paleta.
      accent: hueShiftColor(cores?.accent ?? acc, shift),
      accent2: hueShiftColor(cores?.accent2 ?? acc2, shift),
      accentInk: hueShiftColor(accInk, shift),
      espresso: espresso ? hueShiftColor(espresso, shift) : undefined,
      bg: hueShiftColor(bg, shift),
      bg2: hueShiftColor(bg2, shift),
      panel: hueShiftColor(panel, shift),
      panel2: hueShiftColor(panel2, shift),
      text: hueShiftColor(text, shift),
      muted: hueShiftColor(muted, shift),
    };
  } else if (cores) {
    coresV = cores;
  }
  config.tema = { paleta, variant: variants[(h + seed) % 3], ...(coresV ? { cores: coresV } : {}) };
  const vocabBase = resolvedVocab ?? nicheVocab(paleta, asString(lead.categoria, 150));
  // Idioma do site ≠ pt: a IA devolve os campos adaptados (patch.vocab);
  // sem patch (modelo fora), cai num vocab genérico no idioma em vez de PT.
  config.vocab = siteLang === "pt"
    ? vocabBase
    : patchVocab
      ? { ...vocabBase, ...patchVocab }
      : vocabLocalFallback(vocabBase, siteLang);
  // Fatos reais vencem o patch — horários e avaliações vêm do Maps,
  // e o Instagram descoberto completa o contato.
  if (place.instagram && isRecord(config.contato) && !config.contato.instagram) {
    // place.instagram pode vir como "@user", "user" ou URL completa —
    // normaliza pra URL canônica sem duplicar domínio.
    const raw = String(place.instagram).trim();
    const m = raw.match(/instagram\.com\/(?:p\/)?([A-Za-z0-9_.]+)/i);
    const handle = (m ? m[1] : raw.replace(/^@+/, "")).replace(/\/+$/, "");
    if (/^[A-Za-z0-9_.]{1,30}$/.test(handle)) {
      config.contato.instagram = `https://instagram.com/${handle}`;
    }
  }
  if (place.horariosLabel?.length) config.horariosLabel = place.horariosLabel;
  // Mapa de janelas pro modal de agendamento: Maps direto ou derivado
  // dos labels reais (busca/fallback Google só devolvem o label). Mapa
  // sem nenhuma janela aberta não vale — deixaria o calendário morto.
  const hasOpenWindow = (m: Record<string, [string, string][] | null> | undefined) =>
    Boolean(m && Object.values(m).some((w) => w?.length));
  const horariosMap = [place.horarios,
    horariosFromLabels(config.horariosLabel as [string, string][] | undefined),
  ].find(hasOpenWindow);
  if (horariosMap) config.horarios = horariosMap;
  // Nicho agendável sem horário real → o CTA vira WhatsApp (sem inventar
  // disponibilidade falsa no calendário).
  const vocabCfg = config.vocab as NichoVocab | undefined;
  if (vocabCfg?.cta === "agendar" && !config.horarios) {
    vocabCfg.cta = "zap";
    vocabCfg.ctaLabel = CTA_ZAP_LABEL[siteLang] ?? CTA_ZAP_LABEL.en;
  }
  if (videos.length) config.videos = videos;
  // Nota/reviews do Maps também preenchem o que o lead não tinha (ex.:
  // lead criado a mão sem avaliação — o chip e as avaliações somem sem isso).
  if (!isRecord(config.avaliacoes) && place.avaliacao) {
    config.avaliacoes = { nota: place.avaliacao, total: place.totalAvaliacoes ?? 0, fonte: "Google" };
  }
  if (place.reviews.length && isRecord(config.avaliacoes)) {
    // Site é vitrine: só entra review 4★+ — reclamação real não vira conteúdo de venda.
    const boas = place.reviews.filter((r) => r.nota >= 4);
    (config.avaliacoes as Record<string, unknown>).itens = boas.length ? boas : place.reviews.slice(0, 3);
  }

  // 4) Publica.
  onStep?.(90, "Publicando o site");
  const { error: siteErr } = await db.from("sites").upsert(
    { slug, tipo, nome, lead_id: leadId, config, publicado: true, owner_id: lead.user_id ?? null },
    { onConflict: "slug" },
  );
  if (siteErr) throw httpError(502, `Falha ao publicar site: ${siteErr.message}`);
  await db.from("leads").update({ dados: { ...dados, siteSlug: slug } }).eq("id", leadId);

  return {
    slug,
    nome,
    lang: siteLang,
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

// ---------------------------------------------------------------------------
// generate_app — estúdio de geração livre. O usuário descreve o app/site e
// recebe um HTML single-file completo (inline CSS+JS, sem dependência de
// build) pronto pra preview em iframe e publicação em /site/<slug>.
// ---------------------------------------------------------------------------

const APP_SYSTEM = `Você é o motor do SeekerAi Studio: gera aplicações completas em UM arquivo HTML, com nível visual de produto pago/premium.

REGRAS ABSOLUTAS:
- O PEDIDO DO USUÁRIO MANDA: se qualquer regra abaixo conflitar com o que ele pediu explicitamente (cores, layout, conteúdo, fontes, idioma), a instrução dele vence.
- Responda SOMENTE com o documento HTML completo (<!doctype html>…</html>). Nenhum texto fora, nenhum markdown, nenhuma explicação.
- TUDO inline: um <style> no <head> e um <script> antes de </body>. Bibliotecas externas SÓ via CDN confiável quando essenciais (Google Fonts, lucide via unpkg). Nada de React/build tools.
- Conteúdo REAL e completo, no idioma do pedido (default: português brasileiro): nomes, serviços, preços em R$, avaliações, FAQ — nada de "lorem" ou placeholders vagos.
- ENTREGA COMPLETA, não esqueleto — o produto final tem estrutura de página real. Pedido de site/landing: entregue NO MÍNIMO navbar, hero, faixa de prova social/stats, a seção central do pedido (menu, serviços, produtos), galeria ou destaques, depoimentos/avaliações, FAQ, CTA final e footer rico — cada uma com conteúdo real e completo. App/fluxo: telas completas com estados, não mockups.
- 100% responsivo com mobile-first real (media queries, layout que adapta de verdade).

PROIBIDO (deduz qualidade):
- EMOJIS em QUALQUER lugar da interface — incluindo botões, listas, badges, nav e mensagens de feedback. Casos frequentes que NÃO podem ser emoji: telefone/WhatsApp/celular (use ícone "phone" ou "message-circle" do Lucide, ou o glyph oficial do WhatsApp em SVG), checkmark/seleção (ícone "check"/"check-circle" ou :checked estilizado), setas e chevrons ("arrow-right", "chevron-down"), estrelas de avaliação (SVG "star" preenchido), localização ("map-pin"), redes sociais (SVG da marca), câmera/imagem ("camera", "image"), lixeira/editar ("trash-2", "pencil"). Ícones = SEMPRE SVG inline OU Lucide via <script src="https://unpkg.com/lucide@latest"> + <i data-lucide="nome"> + lucide.createIcons().
- Cores primárias chapadas/sem intenção (vermelho #f00, azul default, coral aleatório). Toda cor sai de uma paleta desenhada pro nicho.
- alert(), confirm(), console.log solto. Links mortos (href="#") sem handler.
- <img> sem src real ou com URL inventada. Sem imagem real? Use gradientes, padrões SVG inline, formas CSS.

DESIGN — padrão mínimo exigido:
- Variáveis CSS no :root: paleta completa (bg, surface, border, text, muted, accent + variações), raio, sombras em camadas (sm/md/lg), escala de espaçamento.
- Tipografia de verdade: fonte display pra títulos + fonte texto pra corpo (Google Fonts), hierarquia clara, letter-spacing ajustado, tamanhos fluidos (clamp).
- Acabamento: botões com hover/active e transition, cards com elevação e border sutil, estados de foco visíveis, animações suaves (fade/slide-up no scroll via IntersectionObserver, keyframes discretos), scrollbar estilizada.
- Paleta coesa por nicho: barbearia → tons escuros âmbar/couro; clínica → claros verde/azul suave; tech → dark com acento neon; restaurante → quentes apetitosos. Nunca a mesma paleta genérica.

BIBLIOTECA DE COMPONENTES — use generosamente o que o pedido pedir, e complemente com o que fizer sentido:
- Navegação: navbar fixa com blur/elevada no scroll, menu hambúrguer animado, tabs estilizadas, segmented control.
- Hero: eyebrow, headline com palavra em gradiente/destaque, subtítulo, CTAs duplos, prova social inline (estrelas, "X clientes").
- Conteúdo: cards com hover-lift e imagem, grids de serviços com preço, comparadores, estatísticas com count-up, timeline, marquee de logos.
- Mídia: galeria grid/masonry com lightbox funcional, carrossel com dots/setas, <video> quando URLs forem dadas.
- Interação: modal e bottom-sheet funcionais, drawer lateral, accordion de FAQ, toasts, tooltips, formulários com validação inline (erro/sucesso), busca/filtro de lista.
- Fluxos COMPLETOS com estado em JS: agendamento multi-step (serviço → profissional → data → horários livres → resumo → confirmação com toast/tela de sucesso, e wa.me real se telefone informado), carrinho com total, quiz, onboarding. Persista seleções em localStorage quando fizer sentido.
- Utilidades: botão WhatsApp flutuante (wa.me), footer completo, skeletons de loading quando simular dados.

TARGET=WEB: site/app web completo — navbar fixa, hero, seções com ritmo alternado, CTA final, footer. Layout respirado, max-width com margens amplas.
TARGET=MOBILE: anatomia de APP NATIVO, não site espremido — status/header de app, cards full-bleed, bottom tab bar fixa com 3-5 ícones SVG + labels (ativa com accent), bottom sheets em vez de modais, safe-area padding, listas com avatares e chevrons, FAB quando couber. Largura de conteúdo ~430px.

MÍDIAS DE REFERÊNCIA: o pedido pode trazer URLs públicas de imagens/vídeos do usuário — incorpore-as de verdade (<img>/<video> com esses src, no lugar que fizer mais sentido).

CHECKLIST ANTES DE FINALIZAR: todo botão faz algo? Algum emoji escapou? Paleta tem identidade? Mobile-first real? Fluxos pedidos funcionam ponta a ponta?`;

function extractHtml(raw: string): string | null {
  const text = raw.trim();
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const html = (fenced ? fenced[1] : text).trim()
    // Rede de segurança: remove emoji/dingbats que o modelo deixar escapar
    // (prompt proíbe, mas garantimos aqui — setas/bolinhas/estrelas unicode
    // também saem porque o padrão visual é SVG/Lucide).
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "");
  const start = html.search(/<!doctype html|<html[\s>]/i);
  if (start < 0) return null;
  const end = html.search(/<\/html>\s*$/i);
  return end >= 0 ? html.slice(start, end + 7) : html.slice(start);
}

async function generateAppHtml(
  apiKey: string | null,
  prompt: string,
  context: Record<string, unknown>,
  onStep?: (pct: number, etapa: string) => void,
): Promise<{ html: string; modelo: string }> {
  const target = asString(context.target, 10) === "mobile" ? "mobile" : "web";
  const refs = Array.isArray(context.refs) ? context.refs.filter(isRecord) : [];
  const mediaLines = refs.map((r) => {
    const url = asString(r.url, 800);
    const kind = asString(r.kind, 10) ?? "image";
    return url ? `- ${kind === "video" ? "Vídeo" : "Imagem"}: ${url}` : "";
  }).filter(Boolean).join("\n");

  // @instagram de referência: raspa perfil+mídia via ScrapeCreators e
  // injeta bio, legendas e URLs reais como inspiração/contexto da IA.
  const igRaw = asString(context.ig, 300);
  const igHandle = igRaw
    ? (igRaw.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1]
      ?? igRaw.replace(/^@+/, "").replace(/\/+$/, ""))
    : null;
  let igBlock = "";
  if (igHandle && /^[A-Za-z0-9._]{1,60}$/.test(igHandle)) {
    onStep?.(15, `Lendo o Instagram @${igHandle}`);
    const cap = new Promise<null>((r) => setTimeout(() => r(null), 35_000));
    const [prof, media] = await Promise.race([
      Promise.all([igProfileCached(igHandle), igMediaCached(igHandle)]),
      cap,
    ]) ?? [null, null];
    if (prof || media) {
      const imgs = (media?.images ?? []).slice(0, 8);
      const caps = (media?.captions ?? []).slice(0, 6);
      igBlock = [
        `INSTAGRAM DE REFERÊNCIA @${igHandle}${prof?.categoria ? ` (${prof.categoria})` : ""} — use como inspiração de identidade visual, tom e conteúdo:`,
        prof?.bio ? `Bio: ${prof.bio}` : "",
        prof?.seguidores != null ? `Seguidores: ${prof.seguidores} · posts: ${prof.posts ?? "?"}` : "",
        imgs.length ? `Imagens reais do perfil — incorpore estas URLs onde fizer sentido (hero, galeria, cards):\n${imgs.map((u) => `- Imagem: ${u}`).join("\n")}` : "",
        media?.videos.length ? `O perfil tem ${media.videos.length} reels/vídeos recentes.` : "",
        caps.length ? `Legendas reais (tom de voz, produtos, diferenciais):\n${caps.map((c) => `"${c.replace(/\s+/g, " ").slice(0, 160)}"`).join("\n")}` : "",
      ].filter(Boolean).join("\n");
    }
  }

  const user = [
    `Pedido do usuário:\n${prompt}`,
    `\nAlvo: ${target === "mobile" ? "APLICATIVO MOBILE (UI de app, bottom nav, gestos)" : "APLICATIVO WEB (site/app web responsivo)"}`,
    mediaLines ? `\nMídias de referência do usuário (incorpore estas URLs):\n${mediaLines}` : "",
    igBlock ? `\n${igBlock}` : "",
  ].join("");

  // Orçamento total da cadeia de provedores — a edge tem wall-clock
  // limitado; estourar aqui derruba a function (HTTP 546 do gateway)
  // em vez de devolver o erro amigável.
  const t0 = Date.now();
  const BUDGET_MS = 270_000;
  const overBudget = () => Date.now() - t0 > BUDGET_MS;
  onStep?.(18, refs.length
    ? `Analisando o pedido e ${refs.length} ${refs.length === 1 ? "mídia de referência" : "mídias de referência"}`
    : "Analisando o pedido");

  let html: string | null = null;
  let modelo = SITE_MODEL;
  let orStatus = 0;
  if (apiKey && !overBudget()) {
    onStep?.(30, "Escrevendo o app com IA");
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        "HTTP-Referer": optionalEnv("APP_URL") ?? "https://seekerai.digital", "X-Title": "SeekerAi Studio",
      },
      body: JSON.stringify({
        model: SITE_MODEL, max_tokens: 16384, temperature: 0.6,
        messages: [
          { role: "system", content: APP_SYSTEM },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(150_000),
    }).catch(() => null);
    orStatus = res?.status ?? 0;
    if (res?.ok) {
      const data = await res.json().catch(() => null) as Record<string, unknown> | null;
      const ch = data && Array.isArray(data.choices) ? data.choices : [];
      const content = isRecord(ch[0]) && isRecord(ch[0].message) ? ch[0].message.content : null;
      if (typeof content === "string") html = extractHtml(content);
    } else {
      console.error("[app] openrouter falhou:", orStatus || "network");
    }
  }
  // Fallbacks gratuitos — em qualquer falha do OpenRouter (rede,
  // 402 sem crédito, 5xx): modelos ":free" do OR em sequência, depois
  // Groq e por último a NVIDIA. Fallback exige documento COMPLETO
  // (</html> presente) — resposta truncada cai pro próximo provedor.
  if (!html) {
    for (const [i, fm] of OR_FREE_APP_MODELS.entries()) {
      if (overBudget()) break;
      onStep?.(35 + i * 6, `Tentando provedor alternativo ${i + 1}`);
      const f = await orFreeChat(APP_SYSTEM, user, 24000, 60_000, fm);
      const fch = f && Array.isArray(f.choices) ? f.choices : [];
      const fContent = isRecord(fch[0]) && isRecord(fch[0].message) ? fch[0].message.content : null;
      if (typeof fContent === "string") {
        const h = extractHtml(fContent);
        if (h && /<\/html>/i.test(h)) { html = h; modelo = fm; break; }
      }
    }
  }
  if (!html && !overBudget()) {
    onStep?.(55, "Tentando provedor alternativo");
    const g = await groqChat(APP_SYSTEM, user, 16384, 60_000);
    const gch = g && Array.isArray(g.choices) ? g.choices : [];
    const gContent = isRecord(gch[0]) && isRecord(gch[0].message) ? gch[0].message.content : null;
    if (typeof gContent === "string") {
      const h = extractHtml(gContent);
      if (h && /<\/html>/i.test(h)) { html = h; modelo = GROQ_TEXT_MODEL; }
    }
  }
  if (!html && !overBudget()) {
    modelo = NVIDIA_TEXT_MODEL;
    onStep?.(62, "Último provedor de reserva");
    const nv = await nvidiaChat(APP_SYSTEM, user, 24000, 60_000);
    const ch = nv && Array.isArray(nv.choices) ? nv.choices : [];
    const content = isRecord(ch[0]) && isRecord(ch[0].message) ? ch[0].message.content : null;
    if (typeof content === "string") html = extractHtml(content);
  }
  if (!html) {
    if (orStatus === 402) throw httpError(503, "Geração de IA temporariamente indisponível");
    throw httpError(502, "A IA não devolveu o app desta vez — tente novamente.");
  }
  return { html, modelo };
}

export async function handle(req: Request): Promise<Response> {
  const notifyCtx: NotifyErrorInput = { onde: "ai-generate", erro: "" };
  let refForNotify: string | null = null;
  try {
    requirePost(req);
    const user = await requireUser(req);
    notifyCtx.usuario = { id: user.id, email: asString((user as Record<string, unknown>).email) };
    const body = await readJson<GenerateBody>(req, 300_000);

    const action = asString(body.action, 40);
    const service = asString(body.serviceSlug, 60);
    const businessRef = asString(body.businessRef, 300);
    refForNotify = businessRef;
    const requestRef = asString(body.requestRef, 150);
    const prompt = asString(body.prompt, 20_000);
    let lang = asString(body.lang, 10) || "pt";
    if (!action || !ACTIONS.has(action) || !service || !businessRef || !requestRef
      || (!prompt && action !== "enhance_reply")) {
      throw httpError(400, "Informe action, serviceSlug, businessRef, requestRef e prompt");
    }
    notifyCtx.contexto = `ação ${action} · serviço ${service} · ref ${businessRef}`;

    const inputHash = await sha256Hex(
      JSON.stringify({ action, businessRef, service, prompt, context: body.context ?? null }),
    );
    const db = serviceClient();

    // enhance_reply é ferramenta interna do atendimento — só admin.
    if (action === "enhance_reply") {
      const { data: prof } = await db.from("profiles")
        .select("role").eq("id", user.id).maybeSingle();
      if (prof?.role !== "admin") throw httpError(403, "Ação restrita ao suporte");
    }
    // Progresso vivo pro painel admin — o orquestrador passa jobId/jobTable.
    const jobId = asString(body.jobId, 40);
    const jobTable = asString(body.jobTable, 30);
    const reportJob = async (p: number, etapa: string) => {
      if (!jobId || (jobTable !== "ai_jobs" && jobTable !== "studio_projects")) return;
      // SSE em tempo real + RPC atômico: progresso/etapa no banco e append
      // do evento no feed `eventos` (fallback se o serviço reiniciar).
      emitJobEvent(jobId, p, etapa);
      await db.rpc("report_job_event", {
        p_table: jobTable, p_id: jobId, p_pct: p, p_etapa: etapa,
      }).then(() => {}, () => {});
    };
    // Copy dirigida ao estabelecimento (abordagem de vendas) sai no idioma
    // do LEAD — derivado do país — não no idioma da interface do usuário.
    if (action === "sales_reply") {
      const { data: leadRow } = await db.from("leads")
        .select("*").eq("id", businessRef).maybeSingle();
      if (leadRow) lang = siteLangFor(leadRow);
    }
    // Anti-spam 1 — mesma ação pro mesmo alvo já está rodando? Clique
    // duplo ou retry de timeout não pode disparar um segundo pipeline
    // pago. Ops presas em 'reserved' (edge morta) liberam após 4min.
    {
      const { data: inflight } = await db.from("credit_operations")
        .select("id")
        .eq("user_id", user.id).eq("action", action).eq("business_ref", businessRef)
        .eq("status", "reserved")
        .gte("created_at", new Date(Date.now() - 4 * 60_000).toISOString())
        .limit(1);
      if (inflight?.length) {
        throw httpError(409, "Essa geração já está em andamento — aguarde ela terminar.");
      }
    }

    // Anti-spam 2 — o MESMO pedido (hash idêntico) já foi gerado há
    // pouco? Devolve a saída salva grátis em vez de queimar o modelo.
    const REPLAYABLE = new Set(["sales_reply", "deep_strategy", "image_prompt"]);
    if (REPLAYABLE.has(action)) {
      const { data: dup } = await db.from("credit_operations")
        .select("id").eq("user_id", user.id).eq("action", action)
        .eq("business_ref", businessRef).eq("input_hash", inputHash)
        .eq("status", "completed")
        .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
        .limit(1);
      if (dup?.length) {
        const { data: out } = await db.from("lead_outputs")
          .select("conteudo,modelo")
          .eq("user_id", user.id).eq("lead_id", businessRef).eq("tipo", action)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (typeof out?.conteudo === "string" && out.conteudo.trim()) {
          return json({
            conteudo: out.conteudo,
            modelo: out.modelo ?? "cache",
            reutilizado: true,
            creditosCobrados: 0,
          });
        }
      }
    }

    const reservation = await reserveAction(db, {
      userId: user.id,
      action,
      businessRef,
      service,
      inputHash,
      requestRef,
    });

    try {
      // Nenhuma ação exige OpenRouter — a NVIDIA (e o Groq no copiloto)
      // assume quando a chave falta ou o provedor falha.
      const apiKey = await getSecret("OPENROUTER_API_KEY");
      const context = isRecord(body.context) ? body.context : {};
      await reportJob(10, "Reservando créditos");

      // Só o prompt — a pessoa copia e usa na IA que quiser (grátis).
      if (action === "image_prompt") {
        const enhanced = await enhanceImagePrompt(prompt ?? "", context);
        await settleAction(db, user.id, requestRef, "completed");
        return json({ conteudo: enhanced, modelo: NVIDIA_TEXT_MODEL, creditosCobrados: reservation.cost });
      }

      // Estúdio livre: HTML single-file completo, sem vínculo com lead.
      // businessRef carrega "studio:<projectId>" pra idempotência.
      if (action === "generate_app") {
        try {
          await reportJob(25, "Recebendo o pedido");
          const app = await generateAppHtml(apiKey, prompt ?? "", context,
            (p, e) => { void reportJob(p, e); });
          await reportJob(85, "Montando o HTML");
          await settleAction(db, user.id, requestRef, "completed");
          return json({
            conteudo: app.html,
            modelo: app.modelo,
            creditosCobrados: reservation.cost,
          });
        } catch (err) {
          await settleAction(db, user.id, requestRef, "refunded");
          throw err;
        }
      }

      // Site premium: publica linha em `sites` + assets no Storage e devolve
      // um card pro lead_outputs — a experiência real vive em /site/<slug>.
      if (action === "generate_site") {
        let site: Awaited<ReturnType<typeof publishPremiumSite>>;
        try {
          site = await publishPremiumSite(
            db, apiKey, businessRef, context,
            (p, e) => { void reportJob(p, e); },
          );
        } catch (err) {
          await settleAction(db, user.id, requestRef, "refunded");
          throw err;
        }
        await settleAction(db, user.id, requestRef, "completed");
        return json({
          conteudo: siteCardHtml(site.slug, site.nome, site.hero, site.lang),
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

      // Um modelo só pras ações de texto: gpt-4o-mini (TEXT_MODEL) — rápido,
      // barato e preciso o bastante pra edição de HTML do editor.
      const model = action === "generate_image" ? IMAGE_MODEL : TEXT_MODEL;

      // Imagem avulsa: o pedido do usuário vira prompt em inglês otimizado
      // com a identidade do estabelecimento embutida.
      const enhancedImagePrompt = action === "generate_image"
        ? await enhanceImagePrompt(prompt ?? "", context)
        : null;

      const userContent = action === "generate_image"
        ? enhancedImagePrompt!
        : action === "enhance_reply"
          ? [
            prompt
              ? `RASCUNHO DO ATENDENTE: ${prompt}`
              : "RASCUNHO DO ATENDENTE: (vazio — escreva a resposta do zero)",
            asString(context.assunto) ? `ASSUNTO DO CHAMADO: ${asString(context.assunto, 140)}` : "",
            asString(context.cliente) ? `CLIENTE: ${asString(context.cliente, 120)}` : "",
            asString(context.marcada)
              ? `MENSAGEM MARCADA PELO ATENDENTE (responda especificamente a ela): ${asString(context.marcada, 1200)}`
              : "",
            Array.isArray(context.mensagens) && context.mensagens.length
              ? `ÚLTIMAS MENSAGENS DA CONVERSA:\n${(context.mensagens as unknown[]).map((m) => `- ${asString(m, 600)}`).join("\n")}`
              : "",
            prompt
              ? "Reescreva o rascunho numa única mensagem pronta pra enviar."
              : "Escreva a melhor resposta possível pro cliente, pronta pra enviar.",
          ].filter(Boolean).join("\n\n")
        : action === "editor_assist"
          ? [
            `INSTRUÇÃO DO USUÁRIO: ${prompt}`,
            asString(context.alvo) ? `ALVO: ${asString(context.alvo)}` : "ALVO: página inteira",
            asString(context.nome) ? `SITE: ${asString(context.nome)}` : "",
            Array.isArray(context.imagens) && context.imagens.length
              ? `IMAGENS ANEXADAS (use como <img src> quando fizer sentido):\n${(context.imagens as unknown[]).map((u) => `- ${asString(u, 1200)}`).join("\n")}`
              : "",
            `HTML ATUAL:\n${asString(context.html, 250_000) ?? ""}`,
          ].filter(Boolean).join("\n\n")
        : body.context
          ? `${prompt ?? ""}\n\nContexto do estabelecimento:\n${JSON.stringify(context)}`
          : prompt ?? "";

      // editor_assist com anexos: as URLs vão como texto (fallbacks
      // sem visão ainda conseguem inserir como <img src>) E como
      // image_url nas chamadas de modelos com visão de verdade.
      const editorImgs = action === "editor_assist" && Array.isArray(context.imagens)
        ? (context.imagens as unknown[])
            .map((u) => asString(u, 1200)).filter((u): u is string => Boolean(u))
            .slice(0, 5)
        : [];

      // Cadeia de provedores: OpenRouter primeiro; NVIDIA como fallback
      // gratuito quando o principal falha (rede, 402, 5xx) ou não devolve imagem.
      const t0 = Date.now();
      let data: Record<string, unknown> | null = null;
      let modelo = model;
      const systemPrompt = systemPromptFor(action, lang);

      // Copiloto do lead e enhance_reply são gratuitos pra todos — provedores
      // free primeiro pra não queimar crédito pago num recurso de graça.
      // editor_assist NÃO entra aqui: é exclusivo Pro/King e a cadeia free
      // serial (60+45+45s, depois de novo no fallback) estourava o timeout
      // da borda → 524 no editor. Vai direto no modelo pago.
      const freeFirst = action === "lead_assist" || action === "enhance_reply";
      if (freeFirst) {
        const cap = action === "lead_assist" ? 1200 : 1500;
        // Conversa ao vivo (copiloto e aprimoramento no chat): timeouts
        // curtos mantêm o pior caso (~65s) abaixo do corte da borda —
        // antes eram 150s e virava 524/erro genérico.
        // valid(): resposta HTTP 200 com content vazio não é acerto —
        // modelo ":free" de raciocínio pode gastar os tokens em
        // reasoning_content e devolver nada. Sem isso a resposta saía
        // como {"conteudo":null} e o front mostrava erro genérico.
        const valid = (d: Record<string, unknown> | null) =>
          chatContent(d) ? d : null;
        const g = valid(await groqChat(systemPrompt, userContent, cap, 25_000));
        const f = g ?? valid(await orFreeChat(systemPrompt, userContent, cap, 20_000));
        const nv = f ?? valid(await nvidiaChat(systemPrompt, userContent, cap, 20_000));
        if (nv) {
          data = nv;
          modelo = g ? GROQ_TEXT_MODEL : f ? OR_FREE_TEXT_MODEL : NVIDIA_TEXT_MODEL;
          console.log(`[ai-generate] ${action} via ${modelo}`);
        }
      }

      // Sem chave o OpenRouter nem é tentado — cai direto nos gratuitos.
      const res = data || !apiKey ? null : await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          // Caps por ação: sem teto o modelo decide o tamanho — resposta
          // simples não pode sair queimando milhares de tokens à toa.
          max_tokens: action === "lead_assist" ? 1200
            : action === "editor_assist" ? 8192
            : action === "enhance_reply" ? 1500
            : action === "sales_reply" ? 2000
            : action === "deep_strategy" ? 4000
            : undefined,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: editorImgs.length
                ? [
                    { type: "text", text: userContent },
                    ...editorImgs.map((url) => ({ type: "image_url", image_url: { url } })),
                  ]
                : userContent,
            },
          ],
        }),
        // Sem timeout o OpenRouter pode segurar a conexão até o gateway cortar.
        // editor_assist tem budget apertado (borda corta ~100s): o resto do
        // tempo fica pros fallbacks rápidos abaixo.
        signal: AbortSignal.timeout(action === "editor_assist" ? 45_000 : 60_000),
      }).catch(() => null);
      const orStatus = res?.status ?? 0;
      if (res?.ok) {
        const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        // Ação de texto com content vazio vale como falha — libera o
        // fallback em vez de devolver {"conteudo":null} pro front.
        if (action === "generate_image" || chatContent(parsed)) data = parsed;
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
        // Qualquer falha do OpenRouter (rede, 402, 5xx, resposta vazia)
        // cai nos gratuitos — timeouts curtos pra caber no budget da borda.
        // lead_assist/enhance_reply já tentaram essa cadeia: só a NVIDIA
        // pode ter entrado depois (breaker de 3min entre instâncias).
        const valid = (d: Record<string, unknown> | null) =>
          chatContent(d) ? d : null;
        const g = freeFirst ? null : valid(await groqChat(systemPrompt, userContent, 8192, 20_000));
        // Com imagens anexadas o free de visão (gemma) entra antes do
        // texto puro — modelo de texto não "vê" a foto, só a URL.
        const f = g ?? (freeFirst ? null : valid(await orFreeChat(
          systemPrompt,
          userContent,
          8192,
          20_000,
          editorImgs.length ? OR_FREE_VISION_MODEL : undefined,
          editorImgs.length ? editorImgs : undefined,
        )));
        const elapsed = Date.now() - t0;
        const nv = f ?? (elapsed < 80_000
          ? valid(await nvidiaChat(
            systemPrompt,
            userContent,
            action === "lead_assist" ? 1200 : action === "editor_assist" ? 8192 : undefined,
            15_000,
          ))
          : null);
        const hit = g ?? f ?? nv;
        if (hit) {
          data = hit;
          modelo = g ? GROQ_TEXT_MODEL : f ? OR_FREE_TEXT_MODEL : NVIDIA_TEXT_MODEL;
          console.log(`[ai-generate] respondido via ${modelo} (fallback)`);
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

      let conteudo = typeof message.content === "string" ? message.content : null;

      // Ação de texto com content vazio mesmo depois dos fallbacks:
      // estorna e devolve erro claro em vez de {"conteudo":null}.
      if (!conteudo && images.length === 0 && action !== "generate_image") {
        await settleAction(db, user.id, requestRef, "refunded");
        throw httpError(502, "A IA respondeu vazio — tente novamente.");
      }

      // Texto vivo pra chat/WhatsApp/tela: nunca renderiza markdown —
      // limpa os resíduos mesmo com o prompt proibindo.
      if (conteudo && action !== "editor_assist") {
        conteudo = stripMarkdown(conteudo);
      }

      // Abordagem vai pro WhatsApp — markdown [texto](url) vira literal
      // quebrado. Achata pra "texto url" e deduplica URL repetida seguida.
      if (action === "sales_reply" && conteudo) {
        conteudo = conteudo
          .replace(/\[([^\]]*)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g,
            (_m, text: string, url: string) => text && text !== url ? `${text} ${url}` : url)
          .replace(/\[(\s*https?:\/\/[^\]\s]+)\s*\]/g, "$1")
          .replace(/(https?:\/\/\S+)\s+\1/g, "$1");
      }

      return json({
        conteudo,
        imagens: images.length > 0 ? images : undefined,
        modelo,
        creditosCobrados: reservation.cost,
      });
    } catch (err) {
      // Qualquer falha após a reserva devolve os créditos — só segura
      // cobrança quando o conteúdo já foi liquidado com sucesso.
      try {
        await settleAction(db, user.id, requestRef, "refunded");
      } catch { /* já liquidado — preserva o outcome original */ }
      if (err instanceof HttpError) throw err;
      console.error("[ai-generate] erro:", err instanceof Error ? err.message : err);
      throw httpError(502, "Provedor de IA indisponível no momento");
    }
  } catch (err) {
    if (refForNotify) {
      const { data: leadRow } = await serviceClient().from("leads")
        .select("nome,categoria,cidade,uf").eq("id", refForNotify).maybeSingle();
      if (leadRow) {
        notifyCtx.negocio = {
          nome: asString(leadRow.nome, 150),
          categoria: asString(leadRow.categoria, 150),
          cidade: [asString(leadRow.cidade, 80), asString(leadRow.uf, 4)]
            .filter(Boolean).join("/") || null,
        };
      }
    }
    await notifyError({
      ...notifyCtx,
      erro: err instanceof Error ? err.message : String(err),
    });
    return fail(err);
  }
}
