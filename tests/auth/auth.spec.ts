import { expect, test, type Page } from "@playwright/test";

const challengeScript = `
const widgets = new Map();
window.turnstile = {
  render(element, options) {
    const id = crypto.randomUUID();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Concluir verificação local";
    button.dataset.challengeId = id;
    button.onclick = () => {
      options.callback("local-captcha-" + crypto.randomUUID());
      button.disabled = true;
      button.textContent = "Verificação local concluída";
    };
    element.appendChild(button);
    widgets.set(id, element);
    return id;
  },
  remove(id) { const element = widgets.get(id); if (element) element.replaceChildren(); widgets.delete(id); }
};`;

test.beforeEach(async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js?*", (route) =>
    route.fulfill({ contentType: "application/javascript", body: challengeScript }));
});

async function solve(page: Page) {
  await page.getByRole("button", { name: "Concluir verificação local", exact: true }).click();
}
async function login(page: Page, email: string) {
  if (new URL(page.url()).pathname !== "/login") await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("local-test-password-123");
  await solve(page);
  await Promise.all([
    page.waitForURL(/\/(?:app|admin)(?:[/?]|$)/, { waitUntil: "domcontentloaded", timeout: 30_000 }),
    page.getByRole("button", { name: "Entrar na minha conta" }).click(),
  ]);
}

test("usuário entra com cookie HttpOnly, persiste após reload e sai", async ({ page, context }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Entrar na minha conta" })).toBeDisabled();
  await login(page, "user@example.test");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Bem-vindo, Conta comum." })).toBeVisible();
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name.includes("auth-token") && !cookie.name.includes("verifier"));
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bem-vindo, Conta comum." })).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/login$/, { waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "Sair da conta" }).click(),
  ]);
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).filter((cookie) => cookie.name.includes("auth-token"))).toHaveLength(0);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("admin depende de role no banco e usuário comum não atravessa a proteção", async ({ page, context }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=/);
  await login(page, "user@example.test");
  await expect(page).toHaveURL(/\/app$/);
  await context.addCookies([{ name: "role", value: "admin", domain: "localhost", path: "/" }]);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app\?estado=acesso-negado/);
  await expect(page.getByRole("heading", { name: "Painel administrativo." })).toHaveCount(0);
  await Promise.all([
    page.waitForURL(/\/login$/, { waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "Sair da conta" }).click(),
  ]);
  await login(page, "admin@example.test");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Painel administrativo." })).toBeVisible();
  await expect(page.getByRole("cell", { name: "4 créditos", exact: true })).toBeVisible();
});

test("falha de login exige novo captcha e a configuração permanece ao trocar para cadastro", async ({ page }) => {
  let scriptLoads = 0;
  page.on("request", (request) => { if (request.url().includes("turnstile/v0/api.js")) scriptLoads++; });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("user@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-incorreta");
  const firstId = await page.getByRole("button", { name: "Concluir verificação local" }).getAttribute("data-challenge-id");
  await solve(page);
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(page.locator(".auth-error[role='alert']")).toContainText("Não foi possível concluir");
  await expect(page.getByRole("button", { name: "Entrar na minha conta" })).toBeDisabled();
  const newChallenge = page.getByRole("button", { name: "Concluir verificação local" });
  await expect(newChallenge).toBeVisible();
  expect(await newChallenge.getAttribute("data-challenge-id")).not.toBe(firstId);
  await page.getByRole("link", { name: "Criar minha conta", exact: true }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await expect(page.getByRole("button", { name: "Concluir verificação local" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar minha conta", exact: true })).toBeDisabled();
  expect(scriptLoads).toBe(1);
});

test("cadastro exige aceite, não pré-marca marketing e solicita confirmação de e-mail", async ({ page }) => {
  await page.goto("/cadastro?plano=pro");
  await page.getByLabel("Seu nome", { exact: true }).fill("Cadastro de teste");
  await page.getByLabel("Telefone", { exact: true }).fill("(11) 99999-9999");
  await page.getByLabel("E-mail", { exact: true }).fill(`new-${Date.now()}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill("local-test-password-123");
  await page.getByLabel("Confirme a senha", { exact: true }).fill("local-test-password-123");
  await expect(page.getByRole("checkbox", { name: /Quero receber/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await solve(page);
  await page.getByRole("button", { name: "Criar minha conta", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("e-mail de confirmação");
  await expect(page).toHaveURL(/\/cadastro\?plano=pro/);
});

test("recuperação tem captcha e mensagens sem enumeração; API rejeita CSRF", async ({ page, request }) => {
  await page.goto("/recuperar-senha");
  await page.getByLabel("E-mail", { exact: true }).fill("inexistente@example.test");
  await expect(page.getByRole("button", { name: "Enviar instruções" })).toBeDisabled();
  await solve(page);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await expect(page.getByRole("status")).toContainText("Se houver uma conta");
  const response = await request.post("/api/auth/login", {
    headers: { Origin: "https://evil.example" },
    data: { email: "user@example.test", password: "local-test-password-123", captchaToken: "local-captcha-invalid" },
  });
  expect(response.status()).toBe(403);
});

test("admin edita preço e benefícios que passam a aparecer na landing e cadastro", async ({ page }) => {
  await login(page, "admin@example.test");
  await page.goto("/admin/planos");
  await page.getByRole("group", { name: "Plano em edição" }).getByRole("button", { name: /^Pro/ }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Pro para agências");
  await page.getByLabel("Preço mensal (R$)", { exact: true }).fill("59,90");
  await page.getByRole("textbox", { name: "Texto do benefício 3", exact: true }).fill("Agente de vendas com IA e contexto");
  await page.getByLabel("Motivo da alteração", { exact: true }).fill("Melhorar apresentação da oferta");
  await page.getByRole("button", { name: "Salvar plano e card" }).click();
  await expect(page.getByRole("status")).toContainText("Salvo");
  await page.goto("/#planos");
  const card = page.locator(".plan-card").filter({ has: page.getByRole("heading", { name: "Pro para agências", exact: true }) });
  await expect(card).toContainText("59,90");
  await expect(card).toContainText("Agente de vendas com IA e contexto");
  await card.getByRole("link", { name: "Quero o SeekerAi Pro" }).click();
  await expect(page.getByText("Plano de interesse:")).toContainText("Pro para agências");
  await expect(page.getByText("Plano de interesse:")).toContainText("59,90");
});
