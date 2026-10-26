import { describe, expect, it } from "vitest";
import { conjLugar, conjNoLugar, siteLocale, siteStrings } from "./site-i18n";

describe("siteStrings", () => {
  it("site BR vem em português", () => {
    const s = siteStrings("pt");
    expect(s.navPortfolio).toBe("Portfólio");
    expect(s.semPref).toBe("Sem preferência");
    expect(s.enviarWhats).toBe("Enviar no WhatsApp");
  });
  it("site US vem em inglês", () => {
    const s = siteStrings("en");
    expect(s.navPortfolio).toBe("Portfolio");
    expect(s.semPref).toBe("No preference");
    expect(s.enviarWhats).toBe("Send on WhatsApp");
    expect(s.waBookHello("Joe's Cuts")).toContain("I'd like to book");
  });
  it("site ES vem em espanhol", () => {
    expect(siteStrings("es").semPref).toBe("Sin preferencia");
  });
  it("lang desconhecida/ausente: ausente→pt, desconhecida→en", () => {
    expect(siteStrings(undefined).navContato).toBe("Contato");
    expect(siteStrings("de").navContato).toBe("Contact");
  });
  it("mensagens do WhatsApp saem no idioma do site", () => {
    expect(siteStrings("en").waFloatMsg("Joe's")).toContain("Hi!");
    expect(siteStrings("es").waFloatMsg("Joe's")).toContain("¡Hola!");
  });
});

describe("conjLugar / conjNoLugar", () => {
  it("pt: artigo contraído", () => {
    expect(conjLugar("o estúdio", "pt")).toBe("do estúdio");
    expect(conjLugar("a barbearia", "pt")).toBe("da barbearia");
    expect(conjNoLugar("do estúdio", "pt")).toBe("no estúdio");
  });
  it("en: prep + 'at'", () => {
    expect(conjLugar("the studio", "en")).toBe("at the studio");
    expect(conjNoLugar("at the studio", "en")).toBe("at the studio");
  });
  it("es: el→del, la→de la", () => {
    expect(conjLugar("el estudio", "es")).toBe("del estudio");
    expect(conjLugar("la barbería", "es")).toBe("de la barbería");
    expect(conjNoLugar("del estudio", "es")).toBe("en el estudio");
  });
});

describe("siteLocale", () => {
  it("locale Intl por lang", () => {
    expect(siteLocale("pt")).toBe("pt-BR");
    expect(siteLocale("en")).toBe("en-US");
    expect(siteLocale("es")).toBe("es-ES");
  });
});
