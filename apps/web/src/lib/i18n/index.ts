import { cookies, headers } from "next/headers";
import { parseLocaleTag, LOCALE_COOKIE, THEME_COOKIE, type Locale, type Theme } from "./shared";

// Detecção de idioma/moeda pelo país da pessoa (server-only).
// Ordem: cookie salvo > Accept-Language do navegador > padrão pt-BR.
// Moeda: Brasil → BRL (PIX + Stripe); Europa (PT, UK, zona do euro…) → EUR;
// resto do mundo → USD. Preços gringos são Stripe-only (cartão).

export * from "./shared";
export type { Locale } from "./shared";

/** Lê cookie salvo → senão Accept-Language → senão pt-BR. */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const saved = jar.get(LOCALE_COOKIE)?.value;
  if (saved) return parseLocaleTag(saved);

  const accept = (await headers()).get("accept-language") ?? "";
  const first = accept.split(",").map((p) => p.split(";")[0].trim()).filter(Boolean)[0];
  return parseLocaleTag(first ?? "pt-BR");
}

/** Tema salvo em cookie — padrão escuro. */
export async function getTheme(): Promise<Theme> {
  return (await cookies()).get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
}
