import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), origin: vi.fn(), rate: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ verifiedSession: mocks.session }));
vi.mock("@/lib/auth/validation", () => ({ allowedOrigin: mocks.origin }));
vi.mock("@/lib/auth/rate-limit", () => ({ authRateLimit: mocks.rate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { POST } from "@/app/api/admin/landing-content/route";

const content = { video_enabled: false, video_urls: {}, showcase_slugs: [] };
const req = (body: unknown, type = "application/json") => new NextRequest("http://localhost:3000/api/admin/landing-content", {
  method: "POST", headers: { "Content-Type": type, Origin: "http://localhost:3000" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.origin.mockReturnValue(true);
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.session.mockResolvedValue({ user: { id: "admin" }, profile: { role: "admin" }, supabase: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ error: null });
});
describe("configuração da landing no admin", () => {
  it("protege origem, sessão, papel, formato e limite", async () => {
    mocks.origin.mockReturnValueOnce(false);
    expect((await POST(req({}))).status).toBe(403);
    expect((await POST(req({}, "text/plain"))).status).toBe(415);
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(req({}))).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ profile: { role: "user" } });
    expect((await POST(req({}))).status).toBe(403);
    mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfter: 30 });
    expect((await POST(req({}))).status).toBe(429);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("exige consentimento e URLs válidas antes de escrever", async () => {
    expect((await POST(req({ content: { ...content, showcase_slugs: ["site-real"] }, showcaseConsent: false }))).status).toBe(400);
    expect((await POST(req({ content: { ...content, video_urls: { pt: "https://example.com/iframe" } }, showcaseConsent: true }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("persiste ligado e desligado na RPC com sessão e revalida", async () => {
    for (const video_enabled of [true, false, true]) {
      const value = { ...content, video_enabled, video_urls: { pt: "https://youtu.be/dQw4w9WgXcQ" } };
      expect((await POST(req({ content: value, showcaseConsent: false }))).status).toBe(200);
      expect(mocks.rpc).toHaveBeenLastCalledWith("configure_landing_content", { p_value: value });
    }
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
  });
  it("não informa sucesso em falha de migration ou de gravação", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: "PGRST202" } });
    const response = await POST(req({ content, showcaseConsent: false }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("202611270000");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
