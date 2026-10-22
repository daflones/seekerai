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
  it("oferece site e imagem em todos os serviços conhecidos", () => {
    for (const service of services) {
      expect(supportsAction(service.id, "generate_site")).toBe(true);
      expect(supportsAction(service.id, "generate_image")).toBe(true);
    }
    expect(supportsAction("desconhecido", "generate_site")).toBe(false);
    expect(supportsAction("desconhecido", "generate_image")).toBe(false);
  });
});
