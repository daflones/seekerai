import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), from: vi.fn(), eq: vi.fn(), in: vi.fn(), select: vi.fn(), order: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
import { publicLandingContent } from "./landing-server";

let setting: unknown;
const sites = [{ slug: "segundo-site", nome: "Segundo" }, { slug: "primeiro-site", nome: "Primeiro" }];
beforeEach(() => {
  vi.clearAllMocks();
  setting = { video_enabled: false, video_urls: {}, showcase_slugs: ["primeiro-site", "site-retirado", "segundo-site"] };
  mocks.admin.mockReturnValue({ from: mocks.from });
  mocks.limit.mockResolvedValue({ data: sites });
  mocks.order.mockReturnValue({ limit: mocks.limit });
  mocks.from.mockImplementation((table) => {
    if (table === "app_settings") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: setting } }) }) }) };
    return { select: mocks.select.mockReturnValue({ eq: mocks.eq.mockReturnValue({ in: mocks.in.mockResolvedValue({ data: sites }), order: mocks.order }) }) };
  });
});

describe("vitrine pública com curadoria", () => {
  it("consulta somente sites publicados selecionados e mantém a ordem editorial", async () => {
    const result = await publicLandingContent();
    expect(mocks.select).toHaveBeenCalledWith("slug,nome");
    expect(mocks.eq).toHaveBeenCalledWith("publicado", true);
    expect(mocks.in).toHaveBeenCalledWith("slug", ["primeiro-site", "site-retirado", "segundo-site"]);
    expect(result.sites).toEqual([{ slug: "primeiro-site", name: "Primeiro" }, { slug: "segundo-site", name: "Segundo" }]);
  });

  it("sem seleção, cai para os sites publicados mais recentes", async () => {
    setting = null;
    const result = await publicLandingContent();
    expect(mocks.in).not.toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith("publicado", true);
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mocks.limit).toHaveBeenCalledWith(8);
    expect(result.sites).toEqual([{ slug: "segundo-site", name: "Segundo" }, { slug: "primeiro-site", name: "Primeiro" }]);
  });
});
