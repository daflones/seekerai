import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/auth",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    channel: process.env.CI ? undefined : "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    { command: "node tests/fixtures/mock-supabase.mjs", url: "http://127.0.0.1:54329/health", reuseExistingServer: false },
    { command: "node tests/fixtures/start-auth-app.mjs", url: "http://127.0.0.1:3100/login", reuseExistingServer: false, timeout: 120_000 },
  ],
});
