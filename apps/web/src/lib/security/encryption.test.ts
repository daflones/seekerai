import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptSecret, encryptSecret, maskSecret } from "./encryption";

beforeEach(() => {
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});
afterEach(() => vi.unstubAllEnvs());

describe("segredos AES-256-GCM", () => {
  it("descriptografa com o mesmo contexto sem expor texto no envelope", () => {
    const encrypted = encryptSecret("segredo-somente-de-teste", "openrouter:api_key");
    expect(encrypted).not.toContain("segredo-somente-de-teste");
    expect(decryptSecret(encrypted, "openrouter:api_key")).toBe("segredo-somente-de-teste");
  });
  it("gera IVs diferentes e rejeita contexto trocado", () => {
    const first = encryptSecret("exemplo", "provedor:chave");
    expect(encryptSecret("exemplo", "provedor:chave")).not.toBe(first);
    expect(() => decryptSecret(first, "outro:chave")).toThrow();
  });
  it("rejeita chave incorreta e envelopes malformados", () => {
    const encrypted = encryptSecret("exemplo", "provedor:chave");
    vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => decryptSecret(encrypted, "provedor:chave")).toThrow();
    expect(() => decryptSecret("v1.invalido", "provedor:chave")).toThrow();
  });
  it("falha fechado quando a chave mestra não está configurada", () => {
    vi.stubEnv("APP_ENCRYPTION_KEY", "");
    expect(() => encryptSecret("exemplo", "provedor:chave")).toThrow();
  });
  it("não revela segredos de até quatro caracteres", () => {
    expect(maskSecret("abc")).toBe("••••");
    expect(maskSecret("chave-1234")).toBe("••••1234");
  });
});
