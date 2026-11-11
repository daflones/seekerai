import { cookies, headers } from "next/headers";
import { parseLocaleTag, LOCALE_COOKIE, THEME_COOKIE, type Locale, type Theme } from "./shared";

// Detecção de idioma/moeda pelo país da pessoa (server-only).
// Ordem: cookie salvo > país do acesso (cf-ipcountry — Cloudflare manda
// de graça; BR sempre cai no site BR mesmo com navegador em inglês)
// > Accept-Language do navegador > padrão pt-BR.
// Moeda: Brasil → BRL (PIX + Stripe); Europa (PT, UK, zona do euro…) → EUR;
// resto do mundo → USD. Preços gringos são Stripe-only (cartão).

export * from "./shared";
export type { Locale } from "./shared";

/** Cookie salvo → cf-ipcountry BR → Accept-Language → pt-BR. */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const saved = jar.get(LOCALE_COOKIE)?.value;
  if (saved) return parseLocaleTag(saved);

  const hs = await headers();
  // Quem acessa do Brasil vê a experiência BR em qualquer domínio —
  // inclusive no .digital quando clicar num anúncio "pra gringo".
  if (hs.get("cf-ipcountry") === "BR") return parseLocaleTag("pt-BR");

  const accept = hs.get("accept-language") ?? "";
  const first = accept.split(",").map((p) => p.split(";")[0].trim()).filter(Boolean)[0];
  return parseLocaleTag(first ?? "pt-BR");
}

/** Tema salvo em cookie — padrão escuro. */
export async function getTheme(): Promise<Theme> {
  return (await cookies()).get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
}
