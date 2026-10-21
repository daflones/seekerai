import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedOrigin, callbackOrigin, loginSchema, safeNext, signupSchema } from "./validation";

afterEach(() => vi.unstubAllEnvs());

describe("validação de autenticação", () => {
  const signup = {
    name: "Conta de teste", phone: "(11) 99999-9999", email: "  EXEMPLO@example.com ",
    password: "teste-unico-123", terms: true, marketing: false, captchaToken: "token-apenas-de-teste",
  };
  it("normaliza e-mail sem modificar senha ou aceitar role do cliente", () => {
    const input = signupSchema.parse({ ...signup, role: "admin" });
    expect(input.email).toBe("exemplo@example.com");
    expect(input.password).toBe(signup.password);
    expect(input).not.toHaveProperty("role");
  });
  it("exige captcha, senha mínima, consentimento explícito e telefone válido", () => {
    for (const fields of [{ terms: false }, { captchaToken: "" }, { password: "123" }, { phone: "--------" }]) {
      expect(signupSchema.safeParse({ ...signup, ...fields }).success).toBe(false);
    }
    expect(signupSchema.parse({ ...signup, marketing: undefined }).marketing).toBe(false);
    expect(loginSchema.safeParse({ email: "exemplo@example.com", password: "exemplo", captchaToken: "" }).success).toBe(false);
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/app/../../evil", "/auth/callback", "javascript:alert(1)", "/app\u0000"])("recusa redirecionamento %s", (next) => {
    expect(safeNext(next)).toBe("/app");
  });
  it("preserva somente caminhos internos da plataforma", () => {
    expect(safeNext("/admin")).toBe("/admin");
    expect(safeNext("/app?plano=pro")).toBe("/app?plano=pro");
    expect(safeNext("/app/leads")).toBe("/app/leads");
    expect(safeNext(undefined)).toBe("/app");
  });
  it("valida origem de produção sem confiar no Host da requisição", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://eletrify.me");
    expect(allowedOrigin("https://eletrify.me")).toBe(true);
    expect(allowedOrigin("https://eletrify.me.evil.example")).toBe(false);
    expect(allowedOrigin("http://localhost:3000")).toBe(false);
    expect(allowedOrigin(null)).toBe(false);
    expect(callbackOrigin("https://evil.example")).toBe("https://eletrify.me");
  });
});
