import { describe, expect, it } from "vitest";
import { configuredCost, previewCreditRules, siteProposalMode } from "./action-policy";

describe("política contextual de ações", () => {
  it("mantém a última regra de busca (4), imagem (2) e site (5)", () => {
    expect(configuredCost(previewCreditRules.search)).toBe(4);
    expect(configuredCost(previewCreditRules.generate_image)).toBe(2);
    expect(configuredCost(previewCreditRules.generate_site)).toBe(5);
    expect(configuredCost(previewCreditRules.deep_strategy)).toBeNull();
  });
  it("não assume tarifa ausente, inválida ou desabilitada", () => {
    expect(configuredCost({ cost: 2, enabled: false })).toBeNull();
    expect(configuredCost({ cost: 0, enabled: true })).toBeNull();
    expect(configuredCost({ cost: 1.5, enabled: true })).toBeNull();
    expect(configuredCost({ cost: null, enabled: true })).toBeNull();
  });
  it("propõe site novo para empresa sem site e redesign apenas com evidências", () => {
    expect(siteProposalMode("sites", { state: "missing", url: null, evidence: [] })).toBe("new");
    expect(siteProposalMode("sites", { state: "improvable", url: "https://example.com", evidence: ["Navegação móvel quebrada"] })).toBe("redesign");
    expect(siteProposalMode("sites", { state: "improvable", url: "https://example.com", evidence: [] })).toBeNull();
    expect(siteProposalMode("sites", { state: "not_analyzed", url: "https://example.com", evidence: [] })).toBeNull();
    expect(siteProposalMode("sites", { state: "current", url: "https://example.com", evidence: [] })).toBeNull();
    // Site e imagem são universais: todo serviço propõe site novo quando falta.
    expect(siteProposalMode("fotografia", { state: "missing", url: null, evidence: [] })).toBe("new");
    expect(siteProposalMode("servico_inexistente", { state: "missing", url: null, evidence: [] })).toBeNull();
  });
});
