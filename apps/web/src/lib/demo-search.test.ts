import { describe, expect, it } from "vitest";
import {
  cidadeMatch, nichoMatch, norm, queryNormOf, toPlace,
  type LeadPoolRow,
} from "./demo-search";

const base: LeadPoolRow = {
  place_id: "ChIJ123", nome: "Clínica Sorriso", endereco: "Rua A, 10",
  bairro: "Centro", cidade: "São Paulo", uf: "SP", telefone: "11999990000",
  site: null, avaliacao: 4.5, total_avaliacoes: 120, categoria: "Dentista",
  maps_url: "https://maps.google.com/?cid=123", imagem: null,
  lat: -23.5, lng: -46.6, whatsapp: "sim", instagram: "clinicasorriso",
  dados: { ig: { seguidores: 1200 }, siteCheck: { estado: "fora", sinais: [] }, horariosLabel: [["seg", "8-18"]] },
};

describe("norm/queryNormOf", () => {
  it("remove acentos, caixa e espaços extras", () => {
    expect(norm("  São   Paulo ")).toBe("sao paulo");
  });
  it("padding facilita match de cidade como palavra inteira", () => {
    expect(queryNormOf("dentistas em São Paulo, centro")).toBe(" dentistas em sao paulo ");
  });
});

describe("cidadeMatch", () => {
  const q = queryNormOf("dentistas em São Paulo");
  it("casa cidade ignorando acento", () => {
    expect(cidadeMatch(base, q)).toBe(true);
  });
  it("não casa cidade diferente nem substring parcial", () => {
    expect(cidadeMatch({ ...base, cidade: "Campinas" }, q)).toBe(false);
    // "Paul"/"Sã" não são palavras inteiras na query — não casam.
    expect(cidadeMatch({ ...base, cidade: "Paul" }, q)).toBe(false);
    expect(cidadeMatch({ ...base, cidade: "Sã" }, q)).toBe(false);
  });
});

describe("nichoMatch", () => {
  it("casa singular/plural por radical (dentista ~ dentistas)", () => {
    expect(nichoMatch(base, "dentistas em São Paulo")).toBe(true);
  });
  it("casa sem preposição de lugar (inglês implícito)", () => {
    expect(nichoMatch(base, "dentist clinics austin")).toBe(true);
  });
  it("não casa categoria não relacionada", () => {
    expect(nichoMatch({ ...base, categoria: "Pizzaria" }, "dentistas em São Paulo")).toBe(false);
  });
});

describe("toPlace", () => {
  it("mapeia colunas do lead pro formato PlaceResult da busca", () => {
    const p = toPlace(base);
    expect(p.id).toBe("ChIJ123");
    expect(p.nome).toBe("Clínica Sorriso");
    expect(p.whatsapp).toBe(true);
    expect(p.instagram).toBe("clinicasorriso");
    expect(p.ig?.seguidores).toBe(1200);
    expect(p.siteCheck?.estado).toBe("fora");
    expect(p.horariosLabel).toEqual([["seg", "8-18"]]);
    expect(p.leadId).toBeNull();
    expect(p.sitePronto).toBe(false);
    // Instagram sem site = prioridade alta (melhor lead pra prospecção).
    expect(p.prioridade).toBe("alta");
  });
});
