import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { verifyAuthenticatedCaptcha } from "./turnstile";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("verificação de captcha em ações autenticadas", () => {
  it("não aceita somente HTTP 200: exige sucesso, hostname e ação", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://seekerai.digital");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "segredo-local-de-teste");
    for (const result of [
      { success: false, hostname: "seekerai.digital", action: "password" },
      { success: true, hostname: "outro.example", action: "password" },
      { success: true, hostname: "seekerai.digital", action: "signup" },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
      expect(await verifyAuthenticatedCaptcha("token", "password", "https://seekerai.digital")).toBe(false);
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, hostname: "seekerai.digital", action: "password" })));
    expect(await verifyAuthenticatedCaptcha("token", "password", "https://seekerai.digital")).toBe(true);
  });
  it("falha fechado sem segredo ou quando a rede falha", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyAuthenticatedCaptcha("token", "password", "https://seekerai.digital")).toBe(false);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "segredo-local-de-teste");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await verifyAuthenticatedCaptcha("token", "password", "https://seekerai.digital")).toBe(false);
  });
});
