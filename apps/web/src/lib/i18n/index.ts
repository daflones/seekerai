import { cookies, headers } from "next/headers";
import { parseLocaleTag, currencyForRegion, LOCALE_COOKIE, THEME_COOKIE, type Locale, type Theme } from "./shared";

// Detecção de idioma/moeda pelo país da pessoa (server-only).
// Ordem: cookie salvo > país do acesso (cf-ipcountry — Cloudflare manda
// de graça; BR sempre cai no site BR mesmo com navegador em inglês)
// > Accept-Language do navegador > padrão pt-BR.
// Moeda: Brasil → BRL (PIX + Stripe); Europa (PT, UK, zona do euro…) → EUR;
// resto do mundo → USD. Preços gringos são Stripe-only (cartão).

export * from "./shared";
export type { Locale } from "./shared";

// Idioma padrão por país de acesso (cf-ipcountry do Cloudflare). O país
// manda: um americano com navegador em pt-BR vê a página em inglês —
// a preferência manual (cookie) e o seletor continuam ganhando quando
// existem. Só mapeamos países de idioma majoritário claro; os demais
// caem no Accept-Language com a moeda da região real.
const COUNTRY_LANG: Record<string, string> = {
  // Lusófonos
  BR: "pt-BR", PT: "pt-PT", AO: "pt-PT", MZ: "pt-PT", CV: "pt-PT",
  GW: "pt-PT", ST: "pt-PT", TL: "pt-PT",
  // Hispanófonos (Espanha + América Latina)
  ES: "es-ES", MX: "es-MX", AR: "es-AR", CO: "es-CO", CL: "es-CL",
  PE: "es-PE", VE: "es-VE", EC: "es-EC", GT: "es-GT", CU: "es-CU",
  BO: "es-BO", DO: "es-DO", HN: "es-HN", PY: "es-PY", SV: "es-SV",
  NI: "es-NI", CR: "es-CR", PA: "es-PA", UY: "es-UY", PR: "es-PR",
  GQ: "es-ES",
  // Francófonos
  FR: "fr-FR", MC: "fr-FR",
  // Germanófonos
  DE: "de-DE", AT: "de-AT",
  // Italiano
  IT: "it-IT",
};

/** Cookie salvo → país do acesso (cf-ipcountry) → Accept-Language → pt-BR. */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const saved = jar.get(LOCALE_COOKIE)?.value;
  if (saved) return parseLocaleTag(saved);

  const hs = await headers();
  const country = (hs.get("cf-ipcountry") ?? "").toUpperCase();
  const accept = hs.get("accept-language") ?? "";
  const first = accept.split(",").map((p) => p.split(";")[0].trim()).filter(Boolean)[0];

  if (country) {
    // País mapeado → idioma dele, não do navegador. Quem acessa do
    // Brasil vê a experiência BR mesmo com o browser em inglês; um
    // americano com browser em pt vê inglês.
    const tag = COUNTRY_LANG[country];
    if (tag) return parseLocaleTag(tag);
    // País sem idioma mapeado → inglês (default internacional), mas a
    // moeda respeita a região real do acesso.
    const loc = parseLocaleTag("en-US");
    return { ...loc, region: country, currency: currencyForRegion(country), isBrazil: false };
  }

  return parseLocaleTag(first ?? "pt-BR");
}

/** Tema salvo em cookie — padrão escuro. */
export async function getTheme(): Promise<Theme> {
  return (await cookies()).get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
}
