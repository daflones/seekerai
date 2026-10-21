import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ready: vi.fn(), rate: vi.fn(), client: vi.fn(), admin: vi.fn(), captcha: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/config", () => ({ authReady: mocks.ready }));
vi.mock("@/lib/auth/rate-limit", () => ({ authRateLimit: mocks.rate }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/auth/turnstile", () => ({ verifyAuthenticatedCaptcha: mocks.captcha }));

import { POST } from "../../app/api/auth/[action]/route";

const verifiedUser = { id: "user-test", email: "teste@example.com", email_confirmed_at: "2026-10-21", identities: [{ id: "identity-test" }] };
let profile: { role: string; consentimento_em: string | null; onboarding_concluido: boolean };
const sdk = {
  auth: {
    signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(),
    getUser: vi.fn(), signOut: vi.fn(), updateUser: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
};
const signup = {
  email: "teste@example.com", password: "senha-apenas-de-teste", name: "Conta de teste",
  phone: "(11) 99999-9999", terms: true, marketing: false, captchaToken: "captcha-de-teste",
};

async function request(action: string, body: object, origin: string | null = "http://localhost:3000") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers.Origin = origin;
  return POST(new NextRequest(`http://localhost:3000/api/auth/${action}`, {
    method: "POST", headers, body: JSON.stringify(body),
  }), { params: Promise.resolve({ action }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  mocks.ready.mockReturnValue(true);
  mocks.rate.mockResolvedValue({ allowed: true, retryAfter: 0 });
  mocks.client.mockResolvedValue(sdk);
  mocks.admin.mockReturnValue(sdk);
  mocks.captcha.mockResolvedValue(true);
  profile = { role: "user", consentimento_em: "2026-10-21", onboarding_concluido: true };
  sdk.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }) }) }) }));
  sdk.auth.signInWithPassword.mockResolvedValue({ data: { user: verifiedUser }, error: null });
  sdk.auth.signUp.mockResolvedValue({ data: { user: verifiedUser }, error: null });
  sdk.auth.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
  sdk.auth.signOut.mockResolvedValue({ error: null });
  sdk.auth.updateUser.mockResolvedValue({ error: null });
  sdk.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  sdk.rpc.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("endpoints de autenticação", () => {
  it("rejeita CSRF, origem ausente, setup pendente e captcha ausente", async () => {
    expect((await request("login", signup, "https://evil.example")).status).toBe(403);
    expect((await request("login", signup, null)).status).toBe(403);
    mocks.ready.mockReturnValue(false);
    expect((await request("login", signup)).status).toBe(503);
    mocks.ready.mockReturnValue(true);
    expect((await request("login", { ...signup, captchaToken: "" })).status).toBe(400);
    expect(sdk.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("envia o token ao captcha nativo do Supabase sem consumi-lo duas vezes", async () => {
    const response = await request("login", signup);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirect: "/app" });
    expect(sdk.auth.signInWithPassword).toHaveBeenCalledWith({
      email: signup.email, password: signup.password, options: { captchaToken: signup.captchaToken },
    });
    expect(mocks.captcha).not.toHaveBeenCalled();
  });
  it("não permite ao cliente escolher a role e só redireciona admin por role do banco", async () => {
    let response = await request("login", { ...signup, role: "admin", next: "/admin" });
    expect(await response.json()).toEqual({ redirect: "/app" });
    profile.role = "admin";
    response = await request("login", signup);
    expect(await response.json()).toEqual({ redirect: "/admin" });
  });
  it("exige completar consentimento antes de abrir a plataforma", async () => {
    profile.consentimento_em = null;
    expect(await (await request("login", signup)).json()).toEqual({ redirect: "/completar-cadastro?next=%2Fapp" });
  });
  it("não ignora captcha inválido ou rate limit", async () => {
    sdk.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: "captcha_failed", message: "detalhe-interno" } });
    const response = await request("login", signup);
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("detalhe-interno");
    sdk.auth.signInWithPassword.mockClear();
    mocks.rate.mockResolvedValue({ allowed: false, retryAfter: 90 });
    const limited = await request("login", signup);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("90");
    expect(sdk.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("registra aceite no servidor e não encaminha role ou senha para metadata", async () => {
    const response = await request("signup", { ...signup, role: "admin", plan: "pro" });
    expect(response.status).toBe(200);
    const call = sdk.auth.signUp.mock.calls[0][0];
    expect(call.options.data).toEqual({ full_name: signup.name });
    expect(call.options.captchaToken).toBe(signup.captchaToken);
    expect(sdk.rpc).toHaveBeenCalledWith("record_registration_consent", {
      p_user: verifiedUser.id, p_name: signup.name, p_phone: signup.phone, p_marketing: false,
    });
    expect(mocks.captcha).not.toHaveBeenCalled();
  });
  it("recusa cadastro sem termos e não altera dados de usuário ocultado pelo provedor", async () => {
    expect((await request("signup", { ...signup, terms: false })).status).toBe(400);
    sdk.auth.signUp.mockResolvedValue({ data: { user: { ...verifiedUser, identities: [] } }, error: null });
    expect((await request("signup", signup)).status).toBe(200);
    expect(sdk.rpc).not.toHaveBeenCalled();
  });
  it("faz recuperação sem expor existência da conta e encaminha token nativo", async () => {
    const first = await (await request("recover", signup)).json();
    sdk.auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "user_not_found" } });
    expect(await (await request("recover", signup)).json()).toEqual(first);
    expect(sdk.auth.resetPasswordForEmail.mock.calls[0][1].captchaToken).toBe(signup.captchaToken);
  });
  it("exige sessão e captcha verificado no servidor para atualizar senha", async () => {
    sdk.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await request("password", signup)).status).toBe(401);
    sdk.auth.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
    mocks.captcha.mockResolvedValue(false);
    expect((await request("password", signup)).status).toBe(400);
    expect(sdk.auth.updateUser).not.toHaveBeenCalled();
    mocks.captcha.mockResolvedValue(true);
    expect((await request("password", signup)).status).toBe(200);
    expect(sdk.auth.updateUser).toHaveBeenCalledWith({ password: signup.password });
  });
  it("encerra apenas a sessão local e não depende de um token reutilizado", async () => {
    expect(await (await request("logout", {})).json()).toEqual({ redirect: "/login" });
    expect(sdk.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("limita o corpo e falha fechado quando o serviço de limites não responde", async () => {
    expect((await request("signup", { payload: "a".repeat(17000) })).status).toBe(413);
    mocks.rate.mockRejectedValue(new Error("erro-interno"));
    const response = await request("login", signup);
    expect(response.status).toBe(503);
    expect(sdk.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
