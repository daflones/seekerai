import { describe, expect, it } from "vitest";
import { makeDemoLeads } from "./catalog";
import { previewPlanCards } from "./plans/preview";

describe("catálogo de demonstração", () => {
  it("adapta os exemplos ao nicho e serviço selecionados", () => {
    const leads = makeDemoLeads("Clínicas de estética", "automacao");
    expect(leads).toHaveLength(3);
    expect(leads[0].name).toBe("Clínica Bem Viver");
    expect(leads[0].issue).toBe("Atendimento a automatizar");
    expect(leads.every((lead) => lead.id.startsWith("demo-"))).toBe(true);
  });
  it("mantém fallback determinístico para entradas desconhecidas", () => {
    expect(makeDemoLeads("desconhecido", "desconhecido")[0].issue).toBe("Sem site próprio");
  });
  it("mantém os quatro planos e slugs únicos", () => {
    expect(previewPlanCards).toHaveLength(4);
    expect(new Set(previewPlanCards.map((plan) => plan.slug)).size).toBe(4);
  });
});
