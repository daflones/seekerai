// Tipos e constantes de i18n seguros para componentes cliente (sem next/headers).

export type Lang = "pt" | "en" | "es" | "fr" | "de" | "it";
export type Currency = "brl" | "usd" | "eur";

export interface Locale {
  lang: Lang;
  currency: Currency;
  region: string;
  isBrazil: boolean;
}

export const LOCALE_COOKIE = "sk_locale";

const EUR_REGIONS = new Set([
  "PT", "IE", "GB", "ES", "FR", "DE", "IT", "NL", "BE", "AT", "FI", "GR",
  "LU", "SI", "SK", "EE", "LV", "LT", "CY", "MT", "HR", "AD", "MC",
  "SM", "VA", "ME", "XK", "CH", "NO", "DK", "SE", "IS", "PL", "CZ", "HU",
  "RO", "BG", "AL", "RS", "BA", "MK", "UA", "MD", "LI", "GI", "IM", "JE",
  "GG", "FO", "GL", "AX", "SJ", "GP", "MQ", "RE", "YT", "GF", "PM", "BL",
  "MF", "NC", "PF", "WF", "TF", "EA", "IC", "AC", "TA",
]);

const SUPPORTED = new Set<Lang>(["pt", "en", "es", "fr", "de", "it"]);

function normLang(tag: string): Lang {
  const l = tag.toLowerCase().split("-")[0] ?? "";
  return (SUPPORTED.has(l as Lang) ? l : "en") as Lang;
}

export function currencyForRegion(region: string): Currency {
  const r = region.toUpperCase();
  if (r === "BR") return "brl";
  if (EUR_REGIONS.has(r)) return "eur";
  return "usd";
}

export function parseLocaleTag(tag: string): Locale {
  const parts = tag.trim().split(/[-_]/);
  const lang = normLang(parts[0] ?? "pt");
  const region = (parts[1] ?? (lang === "pt" ? "BR" : lang === "es" ? "MX" : "US")).toUpperCase();
  return { lang, region, currency: currencyForRegion(region), isBrazil: region === "BR" };
}

// Preços para fora do Brasil (centavos de USD/EUR — mesmo número nas duas).
export const INTL_PRICES: Record<string, number> = {
  essencial: 500,
  pro: 1500,
  king: 2500,
};
export const INTL_PACK_CENTS = 400; // pacote +50 créditos = $4 / €4

export function formatMoney(cents: number, currency: Currency, lang: Lang = "pt"): string {
  const locale = { pt: "pt-BR", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT" }[lang];
  return (cents / 100).toLocaleString(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
}

export const LANG_NAMES: Record<Lang, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
};
