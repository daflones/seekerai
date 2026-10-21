// Geração com IA via OpenRouter — deep_strategy, sales_reply, generate_site,
// generate_image. Chave fica como secret do Supabase; consome créditos.

import {
  asString,
  fail,
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
import { requireSecret } from "../_shared/secrets.ts";

const ACTIONS = new Set([
  "deep_strategy",
  "sales_reply",
  "generate_site",
  "generate_image",
]);

const TEXT_MODEL = optionalEnv("AI_TEXT_MODEL") ?? "openai/gpt-4o-mini";
const IMAGE_MODEL = optionalEnv("AI_IMAGE_MODEL") ?? "google/gemini-2.5-flash-image";
const SITE_MODEL = optionalEnv("AI_SITE_MODEL") ?? "anthropic/claude-sonnet-4.5";

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
      return "Você é um desenvolvedor front-end sênior. Gere um site institucional completo em um único arquivo HTML autocontido (CSS inline), visual moderno em pt-BR, baseado nas informações do estabelecimento. Responda apenas com o código HTML.";
    case "generate_image":
      return "Gere uma imagem profissional e atraente a partir da descrição.";
    default:
      return "Responda em pt-BR.";
  }
}

Deno.serve(async (req) => {
  try {
    requirePost(req);
    const user = await requireUser(req);
    const body = await readJson<GenerateBody>(req, 200_000);

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

    const model = action === "generate_image"
      ? IMAGE_MODEL
      : action === "generate_site"
        ? SITE_MODEL
        : TEXT_MODEL;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await requireSecret("OPENROUTER_API_KEY")}`,
        "Content-Type": "application/json",
        "HTTP-Referer": optionalEnv("APP_URL") ?? "https://seekerai.digital",
        "X-Title": "SeekerAi",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPromptFor(action) },
          {
            role: "user",
            content: body.context
              ? `${prompt}\n\nContexto do estabelecimento:\n${JSON.stringify(body.context)}`
              : prompt,
          },
        ],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      await settleAction(db, user.id, requestRef, "refunded");
      const reason = isRecord(data.error) ? String(data.error.message ?? "") : "";
      if (res.status === 402) {
        throw httpError(503, "Geração de IA temporariamente indisponível");
      }
      console.error("[openrouter] falhou:", res.status, reason);
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
      // Modelos costumam embrulhar HTML em fence de markdown — remove.
      conteudo = conteudo.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
    }

    return json({
      conteudo,
      imagens: images.length > 0 ? images : undefined,
      modelo: model,
      creditosCobrados: reservation.cost,
    });
  } catch (err) {
    return fail(err);
  }
});
