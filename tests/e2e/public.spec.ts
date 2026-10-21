import { expect, test } from "@playwright/test";

test("landing responsiva sem overflow, erros ou falsas integrações", async ({ page }) => {
  const errors: string[] = [];
  const failedAssets: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/_next/static/") && response.status() >= 400) {
      failedAssets.push(response.url());
    }
    if (response.url().includes("/_next/static/") && /\.(css|js)(\?|$)/.test(response.url())) {
      const type = response.headers()["content-type"] ?? "";
      if (!/text\/css|(?:application|text)\/javascript/.test(type)) {
        failedAssets.push(`${response.url()} (${type})`);
      }
    }
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Seu próximo cliente");
  await expect(page.getByText("Dados ilustrativos", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator(".plans-grid .plan-card")).toHaveCount(4);
  await expect(page.getByText(/\b\d+\s+créditos\b/i)).toHaveCount(0);
  await page.getByText("O SeekerAi funciona na minha cidade?", { exact: true }).click();
  await expect(page.getByText(/A busca real está planejada/)).toBeVisible();
  expect(errors).toEqual([]);
  expect(failedAssets).toEqual([]);
});

test("busca demonstrativa, favoritos, vazio e modal com Escape", async ({ page }) => {
  await page.goto("/explorar");
  await page.getByLabel("Eu ofereço").selectOption("automacao");
  await page.getByLabel("Quero encontrar").selectOption("Clínicas");
  await page.getByLabel("Onde?").selectOption("Curitiba, PR");
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await expect(page.getByRole("heading", { name: "Clínica Bem Viver", exact: true })).toBeVisible();
  await expect(page.getByText("Atendimento a automatizar").first()).toBeVisible();
  await page.getByRole("button", { name: "Salvar Clínica Bem Viver", exact: true }).click();
  await page.getByRole("button", { name: "Salvos", exact: true }).click();
  await expect(page.locator(".lead-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Ver oportunidade", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Não é uma análise de um estabelecimento real.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Remover Clínica Bem Viver", exact: true }).click();
  await expect(page.getByText("Seu radar começa por aqui.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver oportunidades", exact: true }).click();
  await expect(page.locator(".lead-card")).toHaveCount(3);
});

test("planos preservam interesse sem iniciar checkout", async ({ page }) => {
  await page.goto("/#planos");
  await page.getByRole("button", { name: "Cartão", exact: true }).click();
  await page.getByRole("link", { name: "Quero o SeekerAi Pro" }).click();
  await expect(page).toHaveURL(/cadastro\?plano=pro&metodo=card/);
  await expect(page.getByText("Plano de interesse:")).toContainText("Pro");
  await expect(page.getByText(/O cadastro ainda não está habilitado/)).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("menu mobile, páginas legais e healthcheck", async ({ page, request }, testInfo) => {
  await page.goto("/");
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.locator("#mobile-menu")).toBeVisible();
    await page.locator("#mobile-menu").getByRole("link", { name: "Planos", exact: true }).click();
    await expect(page.locator("#mobile-menu")).not.toBeVisible();
  }
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacidade da demonstração");
  await page.goto("/termos");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Termos da demonstração");
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok", service: "seekerai-web" });
});

test("prefere movimento reduzido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const animation = await page.locator(".hero-content").evaluate((element) => getComputedStyle(element).animationName);
  expect(animation).toBe("none");
});

test("catálogo ampliado e ferramentas contextuais ficam na plataforma", async ({ page }) => {
  await page.goto("/explorar");
  const select = page.getByLabel("Eu ofereço");
  await expect(select.locator("option")).toHaveCount(20);
  await expect(select.locator("optgroup")).toHaveCount(3);
  await select.selectOption("edicao_video");
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await expect(page.getByText("Conteúdo em vídeo a aprimorar").first()).toBeVisible();
  await page.getByRole("button", { name: "Ver oportunidade", exact: true }).first().click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /Criar site/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await select.selectOption("design");
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await expect(page.getByText("Materiais visuais a desenvolver").first()).toBeVisible();
  await page.getByRole("button", { name: "Ver oportunidade", exact: true }).first().click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /Criar imagem/ })).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("2 créditos por estabelecimento");
});
