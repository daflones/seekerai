import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const child = spawn(process.execPath, [
  path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3100",
], {
  cwd: path.join(root, "apps/web"),
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_APP_URL: "http://localhost:3100",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-public-fixture-key",
    SUPABASE_SECRET_KEY: "local-private-fixture-key",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "local-widget-fixture-key",
    TURNSTILE_SECRET_KEY: "local-captcha-fixture-secret",
    AUTH_RATE_LIMIT_SECRET: "local-rate-limit-fixture-secret",
    SUPABASE_AUTH_READY: "true",
    SEEKERAI_DEV_DIST_DIR: ".next-auth-test",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
