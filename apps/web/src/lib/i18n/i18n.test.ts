import { describe, expect, it } from "vitest";
import { getMessages } from "./messages";
import { dateTag, formatMoney, INTL_PRICES, type Lang, type Locale } from "./shared";
import { cityGroupsFor, nicheGroupsFor, planText, serviceCategory, serviceName } from "../catalog-i18n";

const LANGS: Lang[] = ["pt", "en", "es", "fr", "de", "it"];
const NON_PT: Lang[] = ["en", "es", "fr", "de", "it"];
const loc = (lang: Lang, region: string, isBrazil = false, currency: Locale["currency"] = "usd"): Locale =>
  ({ lang, region, isBrazil, currency });

describe("dicionários por idioma", () => {
  it("todos os idiomas têm os blocos demo/portfolio/support/home preenchidos", () => {
    for (const lang of LANGS) {
      const m = getMessages(lang);
      expect(m.demo.heading.length).toBeGreaterThan(5);
      expect(m.demo.tools.site.length).toBeGreaterThan(2);
      expect(m.portfolio.s0t.length).toBeGreaterThan(5);
      expect(m.portfolio.themes.bento[0].length).toBeGreaterThan(1);
      expect(m.support.subject.length).toBeGreaterThan(2);
      expect(Object.keys(m.support.status)).toContain("em_andamento");
      expect(m.home.biz.length).toBeGreaterThan(3);
    }
  });

  it("idiomas estrangeiros não vazam português nos blocos novos", () => {
    const pt = getMessages("pt");
    for (const lang of NON_PT) {
      const m = getMessages(lang);
      expect(m.demo.heading).not.toBe(pt.demo.heading);
      expect(m.demo.copy).not.toBe(pt.demo.copy);
      expect(m.portfolio.s0t).not.toBe(pt.portfolio.s0t);
      expect(m.support.send).not.toBe(pt.support.send);
      expect(m.home.siteBtn).not.toBe(pt.home.siteBtn);
    }
  });
});

describe("catálogo localizado", () => {
  it("nomes de serviço traduzem e caem no fallback PT", () => {
    expect(serviceName("sites", "Criação de sites", "pt")).toBe("Criação de sites");
    expect(serviceName("sites", "Criação de sites", "en")).toBe("Website creation");
    expect(serviceName("desconhecido", "Qualquer coisa", "fr")).toBe("Qualquer coisa");
  });

  it("categorias de serviço traduzem", () => {
    expect(serviceCategory("Web e tecnologia", "en")).toBe("Web & technology");
    expect(serviceCategory("Marketing e vendas", "de")).toBe("Marketing & Vertrieb");
  });

  it("nichos traduzem mas mantêm o canônico PT", () => {
    const en = nicheGroupsFor("en");
    const barber = en.flatMap((g) => g.options).find((o) => o.label === "Barbershops");
    expect(barber?.canonical).toBe("Barbearias");
    // PT devolve label == canonical
    const pt = nicheGroupsFor("pt");
    expect(pt.flatMap((g) => g.options).every((o) => o.label === o.canonical)).toBe(true);
  });

  it("cidades seguem região e idioma", () => {
    expect(cityGroupsFor(loc("pt", "BR", true, "brl"))[0].region).not.toBe("United States");
    expect(cityGroupsFor(loc("en", "US"))[0].region).toBe("United States");
    expect(cityGroupsFor(loc("pt", "PT", false, "eur"))[0].region).toBe("Portugal");
    expect(cityGroupsFor(loc("de", "DE", false, "eur"))[0].region).toBe("Deutschland");
    expect(cityGroupsFor(loc("it", "IT", false, "eur"))[0].cities[0].label).toBe("Roma");
  });

  it("textos de plano traduzem com fallback", () => {
    expect(planText("MAIS POPULAR", "en")).toBe("MOST POPULAR");
    expect(planText("Começar grátis", "es")).toBe("Empezar gratis");
    expect(planText("string não mapeada", "fr")).toBe("string não mapeada");
  });
});

describe("moeda e formato", () => {
  it("formata BRL/USD/EUR no locale certo", () => {
    expect(formatMoney(500, "usd", "en")).toContain("$");
    expect(formatMoney(1500, "eur", "de")).toContain("15");
    expect(formatMoney(4990, "brl", "pt")).toContain("R$");
  });

  it("preços internacionais: 5/15/25", () => {
    expect(INTL_PRICES.essencial).toBe(500);
    expect(INTL_PRICES.pro).toBe(1500);
    expect(INTL_PRICES.king).toBe(2500);
  });

  it("dateTag cobre todos os idiomas", () => {
    for (const lang of LANGS) expect(dateTag(lang)).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
  });
});
