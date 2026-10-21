import { describe, expect, it } from "vitest";
import { makeDemoLeads, plans } from "./catalog";

describe("catálogo de demonstração", () => {
  it("adapta os exemplos ao nicho e serviço selecionados", () => {
    const leads = makeDemoLeads("Clínicas", "automacao");
    expect(leads).toHaveLength(3);
    expect(leads[0].name).toBe("Clínica Bem Viver");
    expect(leads[0].issue).toBe("Atendimento a automatizar");
    expect(leads.every((lead) => lead.id.startsWith("demo-"))).toBe(true);
  });
  it("mantém fallback determinístico para entradas desconhecidas", () => {
    expect(makeDemoLeads("desconhecido", "desconhecido")[0].issue).toBe("Sem site próprio");
  });
  it("mantém os quatro planos e slugs únicos", () => {
    expect(plans).toHaveLength(4);
    expect(new Set(plans.map((plan) => plan.id)).size).toBe(4);
  });
});
