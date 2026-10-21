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
]);

const TEXT_MODEL = optionalEnv("AI_TEXT_MODEL") ?? "openai/gpt-4o-mini";
const IMAGE_MODEL = optionalEnv("AI_IMAGE_MODEL") ?? "google/gemini-2.5-flash-image";
const SITE_MODEL = optionalEnv("AI_SITE_MODEL") ?? "anthropic/claude-sonnet-4.5";
const MAX_SITE_IMAGES = 3;

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
  context?: Record<string, unknown>;
}

function systemPromptFor(action: string): string {
  switch (action) {
    case "deep_strategy":
      return "Você é um estrategista de vendas B2B brasileiro. Analise o estabelecimento e produza: diagnóstico, oportunidades, ângulos de abordagem e próximos passos práticos. Responda em pt-BR, direto e acionável.";
    case "sales_reply":
      return "Você é um copiloto de vendas. Escreva uma mensagem de abordagem curta, personalizada e natural em pt-BR para o estabelecimento descrito. Sem emojis excessivos, sem promessas irreais.";
    case "generate_site":
      return [
        "Você é um diretor de arte e desenvolvedor front-end premiado (nível Awwwards).",
        "Gere um site institucional completo em um único arquivo HTML autocontido, em pt-BR.",
        "REGRAS VISUAIS OBRIGATÓRIAS:",
        "- Use EXCLUSIVAMENTE as URLs de imagem fornecidas no contexto para toda fotografia (hero, galeria, seções). Nunca placeholders, nunca unplash/picsum.",
        "- PROIBIDO emojis em qualquer lugar — use ícones SVG inline discretos (lucide-style, stroke 1.5px) quando necessário.",
        "- Tipografia editorial: Google Fonts (uma serif display + uma sans para corpo), hierarquia clara, tracking refinado.",
        "- Paleta sofisticada derivada do negócio; fundos com profundidade (gradientes sutis, texturas), não cores chapadas.",
        "- Layout com respiro: whitespace generoso, grid assimétrico, seções alternando claro/escuro.",
        "- Micro-interações CSS puras (hover, reveal on scroll via IntersectionObserver em JS inline mínimo).",
        "- Botão de contato/WhatsApp com link real quando telefone disponível.",
        "- Responsivo mobile-first, HTML semântico e acessível (alt real, aria onde preciso).",
        "Responda APENAS com o código HTML, sem comentários fora do código.",
      ].join("\n");
    case "lead_assist":
      return [
        "Você é o copiloto de conversão do SeekerAi: um closer B2B brasileiro experiente",
        "acompanhando este lead específico em tempo real.",
        "Use TODOS os dados do contexto (estabelecimento, avaliações, site, WhatsApp, status",
        "do funil e o que já foi gerado) para responder de forma concreta.",
        "Ajude a converter: sugira ângulos de abordagem, mensagens prontas para copiar,",
        "respostas para objeções, próximos passos e o que fazer em cada etapa do funil",
        "(novo → contatado → respondeu → proposta → ganho).",
        "Respostas curtas e diretas em pt-BR, com mensagens prontas entre aspas quando fizer sentido.",
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
      return "Responda em pt-BR.";
  }
}

/** Coleta URLs de imagem já presentes no contexto (resultado Apify/Places). */
function contextImages(context: Record<string, unknown> | undefined): string[] {
  if (!context) return [];
  const images = new Set<string>();
  for (const key of ["imagens", "images", "photos"]) {
    const value = context[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.startsWith("http")) images.add(item);
        else if (isRecord(item) && typeof item.url === "string" && item.url.startsWith("http")) {
          images.add(item.url);
        }
      }
    }
  }
  const single = context.imagem ?? context.imageUrl;
  if (typeof single === "string" && single.startsWith("http")) images.add(single);
  return [...images].slice(0, MAX_SITE_IMAGES);
}

/** Gera imagem via OpenRouter; se falhar, cai para a NVIDIA. Retorna data URL ou null. */
async function generateSiteImage(
  apiKey: string,
  imagePrompt: string,
): Promise<string | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
  }).catch(() => null);
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
  } else {
    console.error("[site-image] openrouter falhou:", res?.status ?? "network");
  }
  return nvidiaImage(imagePrompt);
}

function imagePromptsFor(context: Record<string, unknown> | undefined): string[] {
  const nome = asString(context?.nome) ?? "estabelecimento local";
  const categoria = asString(context?.categoria) ?? "negócio local";
  return [
    `Fotografia profissional de alta qualidade da fachada/ambiente de ${nome}, ${categoria} brasileiro. Luz natural quente, composição editorial, estilo fotografia comercial premium, sem texto ou marcas.`,
    `Fotografia de detalhe do produto/serviço de ${nome} (${categoria}). Close-up apetitoso e elegante, fundo desfocado, iluminação de estúdio suave, estilo editorial premium, sem texto.`,
    `Fotografia do interior/atendimento de ${nome}, ${categoria}. Ambiente acolhedor e sofisticado, pessoas desfocadas ao fundo, luz ambiente quente, estilo revista, sem texto.`,
  ];
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
      const apiKey = await requireSecret("OPENROUTER_API_KEY");
      const context = isRecord(body.context) ? body.context : {};

      // Pipeline de imagens para generate_site: reais do scrape + geradas se faltar.
      const imageUrls: string[] = [];
      if (action === "generate_site") {
        imageUrls.push(...contextImages(context));
        const faltando = Math.min(2, MAX_SITE_IMAGES - imageUrls.length);
        if (faltando > 0) {
          const prompts = imagePromptsFor(context);
          // Paralelo — senão cada imagem soma ~30-60s e estoura o tempo da function.
          const enhanced = await Promise.all(
            prompts.slice(0, faltando).map((p) => enhanceImagePrompt(p, context)),
          );
          const generated = await Promise.all(
            enhanced.map((p) => generateSiteImage(apiKey, p)),
          );
          imageUrls.push(...generated.filter((u): u is string => typeof u === "string"));
        }
      }

      const model = action === "generate_image"
        ? IMAGE_MODEL
        : action === "generate_site"
          ? SITE_MODEL
          : TEXT_MODEL;

      // Imagem avulsa: o pedido do usuário vira prompt em inglês otimizado
      // com a identidade do estabelecimento embutida.
      const enhancedImagePrompt = action === "generate_image"
        ? await enhanceImagePrompt(prompt, context)
        : null;

      const userContent = action === "generate_site"
        ? `${prompt}\n\nContexto do estabelecimento:\n${JSON.stringify(context)}\n\n` +
          `URLs de imagem disponíveis (use TODAS nos <img> apropriados — hero primeiro):\n` +
          imageUrls.map((u, i) => `${i + 1}. ${u}`).join("\n")
        : action === "generate_image"
          ? enhancedImagePrompt!
        : body.context
          ? `${prompt}\n\nContexto do estabelecimento:\n${JSON.stringify(context)}`
          : prompt;

      // Cadeia de provedores: OpenRouter primeiro; NVIDIA como fallback
      // gratuito quando o principal falha (rede, 402, 5xx) ou não devolve imagem.
      const t0 = Date.now();
      let data: Record<string, unknown> | null = null;
      let modelo = model;
      const systemPrompt = systemPromptFor(action);
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
          max_tokens: action === "generate_site" ? 12000 : action === "lead_assist" ? 1200 : undefined,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
        // Sem timeout o OpenRouter pode segurar a conexão até o gateway cortar.
        // Site precisa de mais tempo: o HTML completo são milhares de tokens.
        signal: AbortSignal.timeout(action === "generate_site" ? 200_000 : 60_000),
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
            action === "generate_site" ? 12000 : action === "lead_assist" ? 1200 : undefined,
            action === "generate_site" ? 200_000 : 120_000,
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

      let conteudo = typeof message.content === "string" ? message.content : null;
      if (conteudo && action === "generate_site") {
        conteudo = conteudo.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
      }

      return json({
        conteudo,
        imagens: images.length > 0 ? images : undefined,
        imagensUsadas: action === "generate_site" ? imageUrls : undefined,
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
