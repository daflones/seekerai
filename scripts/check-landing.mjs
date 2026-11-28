import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseURL = process.env.LANDING_TEST_URL ?? "http://localhost:3001";
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "msedge" });
const errors = [];
try {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await context.addCookies([{ url: baseURL, name: "sk_theme", value: theme }]);
    await context.route(/googletagmanager\.com|connect\.facebook\.net|facebook\.com\/tr/, (route) => route.abort());
    await context.route("**/api/demo/search", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ leads: [], site: null, restante: 3 }),
    }));
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => { if (msg.type() === "error" && /hydrat|didn't match/i.test(msg.text())) errors.push(msg.text()); });
    for (const lang of ["pt-BR", "en-US", "es-ES", "fr-FR", "de-DE", "it-IT"]) {
      await context.addCookies([{ url: baseURL, name: "sk_locale", value: lang }]);
      await page.setViewportSize({ width: 1440, height: 1000 });
      const response = await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(response.status(), 200);
      assert.equal(await page.locator("html").getAttribute("lang"), lang.split("-")[0]);
      assert.equal(await page.locator(".lp-hero h1").count(), 1);
      assert.equal(await page.locator(".lp-journey-steps button").count(), 4);
      for (let i = 0; i < 4; i++) {
        const button = page.locator(".lp-journey-steps button").nth(i);
        await button.click();
        assert.equal(await button.getAttribute("aria-pressed"), "true");
        assert.equal(await page.locator(".lp-journey-copy h3").textContent(), await button.locator("strong").textContent());
      }
      for (let i = 0; i < 3; i++) {
        await page.locator(".lp-niche-controls button").nth(i).click();
        assert.equal(await page.locator(".lp-niche-controls button").nth(i).getAttribute("aria-pressed"), "true");
        const brand = await page.locator(".lp-niche-browser .lp-site-nav strong").textContent();
        assert.equal(await page.locator(".lp-message-attachment strong").textContent(), brand);
      }
      const before = await page.locator(".lp-copilot-conversation").textContent();
      await page.locator(".lp-copilot-prompts button").nth(1).click();
      assert.notEqual(await page.locator(".lp-copilot-conversation").textContent(), before);
      const anchors = await page.locator(".floating-nav a[href^='#'], .footer a[href^='#']").evaluateAll((els) =>
        els.map((a) => a.getAttribute("href")).filter((href) => !document.querySelector(href)));
      assert.deepEqual(anchors, []);
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${lang}/${theme}/${width}: overflow`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator(".mobile-menu-button").click();
      assert.equal(await page.locator("#mobile-menu").isVisible(), true);
      await page.locator("#mobile-menu a[href='#sites-ia']").click();
      assert.equal(await page.locator("#mobile-menu").count(), 0);
      const summary = page.locator(".faq-list summary").first();
      await summary.click();
      assert.equal(await summary.evaluate((el) => el.parentElement.open), true);
      const schema = JSON.parse(await page.locator("script[type='application/ld+json']").textContent());
      assert.equal(schema["@graph"][1].mainEntity.length, await page.locator(".faq-list details").count());
      if (lang === "pt-BR") {
        for (const [size, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: `.cache/landing-${size}-${theme}.png` });
        }
      }
      console.log(`PASS ${lang} / ${theme}: workflow, niches, outreach, copilot, navigation, FAQ, 5 viewport widths`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  const denied = await fetch(`${baseURL}/api/admin/landing-content`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: baseURL },
    body: JSON.stringify({ content: { video_enabled: false, video_urls: {}, showcase_slugs: [] }, showcaseConsent: false }),
  });
  assert.ok([401, 403].includes(denied.status));
  console.log("PASS unauthenticated admin mutation rejected; no hydration or runtime errors");
} finally {
  await browser.close();
}
