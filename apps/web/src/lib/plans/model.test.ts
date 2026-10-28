import { describe, expect, it } from "vitest";
import { cardContentSchema, formatPlanPrice, marketingTextAllowed } from "./model";
import { previewPlanCards } from "./preview";

describe("cards de planos", () => {
  it("oferece três prévias válidas e destaca agente nos planos pagos", () => {
    expect(previewPlanCards).toHaveLength(3);
    for (const plan of previewPlanCards) {
      expect(cardContentSchema.safeParse(plan.content).success).toBe(true);
      expect(plan.content.features.some((item) => item.icon === "bot" && item.highlight)).toBe(true);
    }
  });
  it("mantém créditos fora do marketing sem bloquear cartão de crédito", () => {
    expect(marketingTextAllowed("150 créditos por mês")).toBe(false);
    expect(marketingTextAllowed("Créditos para imagens")).toBe(false);
    expect(marketingTextAllowed("Agente de IA ilimitado")).toBe(false);
    expect(marketingTextAllowed("Buscas ilimitadas")).toBe(false);
    expect(marketingTextAllowed("Sem cartão de crédito")).toBe(true);
    expect(marketingTextAllowed("Trabalhos ilimitados no portfólio")).toBe(true);
  });
  it("impede temas arbitrários, IDs repetidos e um card sem benefícios visíveis", () => {
    const content = structuredClone(previewPlanCards[2].content);
    expect(cardContentSchema.safeParse({ ...content, theme: "url(javascript:alert(1))" }).success).toBe(false);
    expect(cardContentSchema.safeParse({ ...content, features: [content.features[0], content.features[0]] }).success).toBe(false);
    expect(cardContentSchema.safeParse({ ...content, features: content.features.map((item) => ({ ...item, visible: false })) }).success).toBe(false);
  });
  it("formata centavos sem alterar o valor", () => {
    expect(formatPlanPrice(2490)).toBe("24,90");
    expect(formatPlanPrice(4990)).toBe("49,90");
    expect(formatPlanPrice(0)).toBe("0");
  });
});
