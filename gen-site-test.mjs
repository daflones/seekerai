import { writeFileSync } from "node:fs";

const API = "https://openrouter.ai/api/v1/chat/completions";
const KEY = process.env.OPENROUTER_API_KEY;
const HEADERS = {
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://seekerai.digital",
  "X-Title": "SeekerAi",
};

// Contexto simulando um resultado real do Apify (imagem real do Maps).
const context = {
  nome: "Padaria Pão Quente",
  categoria: "Padaria artesanal",
  cidade: "Teresópolis/RJ",
  telefone: "(21) 98765-4321",
  avaliacao: 4.7,
  totalAvaliacoes: 312,
  imagem: "https://lh3.googleusercontent.com/grass-cs/AABkmLelJEDOYdPEgpJxqRyqABZGWCawZjprscknb3tpsmvG1ygZeEQZxcS7USqlx5hda-y25yxmh2P44NXCJn9NXu97k9B2MVSo7hkI3HfZ2qK_tNw2cVf07Ry_MB5TJp_LjFEjLItCk3urc9N7=w408-h513-k-no",
};
const prompt = "Site institucional para a padaria. Destaque: pães de fermentação natural, café da manhã, bolos sob encomenda. Tom acolhedor e premium.";

async function genImage(imagePrompt) {
  const res = await fetch(API, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      messages: [{ role: "user", content: imagePrompt }],
    }),
  });
  const d = await res.json();
  if (!res.ok) { console.log("img HTTP " + res.status, JSON.stringify(d).slice(0, 150)); return null; }
  const imgs = d.choices?.[0]?.message?.images ?? [];
  return imgs[0]?.image_url?.url ?? null;
}

async function chat(model, system, user, maxTokens) {
  const res = await fetch(API, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const d = await res.json();
  if (!res.ok) { console.log("chat HTTP " + res.status, JSON.stringify(d).slice(0, 200)); return null; }
  return { content: d.choices?.[0]?.message?.content ?? "", cost: d.usage?.cost };
}

// ---- pipeline igual à edge function ----
const imageUrls = [context.imagem];
const prompts = [
  `Fotografia profissional de alta qualidade de pães artesanais de fermentação natural da ${context.nome}, padaria brasileira. Close-up apetitoso, crosta dourada, luz natural quente, estilo editorial premium, sem texto.`,
  `Fotografia do interior aconchegante de padaria artesanal brasileira, balcão com produtos, luz ambiente quente, estilo revista, sem texto.`,
];
if (process.env.SKIP_IMAGES !== "1") {
  for (const p of prompts.slice(0, 2)) {
    const url = await genImage(p);
    console.log("imagem:", url ? url.slice(0, 50) + "..." : "falhou");
    if (url) imageUrls.push(url);
  }
}

const system = [
  "Você é um diretor de arte e desenvolvedor front-end premiado (nível Awwwards).",
  "Gere um site institucional completo em um único arquivo HTML autocontido, em pt-BR.",
  "REGRAS VISUAIS OBRIGATÓRIAS:",
  "- Use EXCLUSIVAMENTE as URLs de imagem fornecidas no contexto para toda fotografia (hero, galeria, seções). Nunca placeholders.",
  "- PROIBIDO emojis — use ícones SVG inline discretos (stroke 1.5px) quando necessário.",
  "- Tipografia editorial: Google Fonts (serif display + sans), hierarquia clara.",
  "- Paleta sofisticada; fundos com profundidade, não cores chapadas.",
  "- Layout com respiro, seções alternando claro/escuro, grid assimétrico.",
  "- Micro-interações CSS puras + IntersectionObserver para reveal.",
  "- Botão WhatsApp com link real (wa.me/5521987654321).",
  "- Responsivo, semântico, acessível.",
  "Responda APENAS com o código HTML.",
].join("\n");

const user = `${prompt}\n\nContexto:\n${JSON.stringify(context)}\n\nURLs de imagem (use TODAS):\n${imageUrls.map((u, i) => `${i + 1}. ${u}`).join("\n")}`;

const out = await chat("anthropic/claude-sonnet-4.5", system, user, 12000);
if (out?.content) {
  const clean = out.content.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
  writeFileSync("site-teste.html", clean);
  console.log("OK", clean.length, "chars, custo:", out.cost, "| imagens:", imageUrls.length);
}
