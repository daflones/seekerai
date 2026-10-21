import { describe, expect, it } from "vitest";
import { findService, serviceCategories, services, supportsAction } from "./service-catalog";

describe("catálogo de serviços", () => {
  it("inclui os vinte serviços, sem slugs duplicados", () => {
    expect(services).toHaveLength(20);
    expect(new Set(services.map((service) => service.id)).size).toBe(services.length);
    for (const service of services) expect(serviceCategories).toContain(service.category);
  });
  it.each(["trafego", "edicao_video", "gravacao_video", "fotografia", "motion_design", "copywriting"])("oferece %s", (id) => {
    expect(findService(id)).toBeDefined();
  });
  it("só apresenta ferramentas de geração compatíveis com o serviço", () => {
    expect(supportsAction("sites", "generate_site")).toBe(true);
    expect(supportsAction("landing_pages", "generate_site")).toBe(true);
    expect(supportsAction("design", "generate_image")).toBe(true);
    expect(supportsAction("design", "generate_site")).toBe(false);
    expect(supportsAction("edicao_video", "generate_site")).toBe(false);
    expect(supportsAction("fotografia", "generate_image")).toBe(true);
    expect(supportsAction("automacao", "generate_image")).toBe(false);
    expect(supportsAction("desconhecido", "generate_site")).toBe(false);
  });
});
