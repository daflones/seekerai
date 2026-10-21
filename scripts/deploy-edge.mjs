// Deploy das Edge Functions + sincronização de secrets no Supabase remoto.
// Uso: node scripts/deploy-edge.mjs [--secrets] [--functions]
// Lê .env.local (não imprime valores), grava supabase/.env.edge (gitignored)
// e chama a CLI do Supabase com SUPABASE_ACCESS_TOKEN do ambiente local.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadLocalEnv() {
  const file = path.join(root, ".env.local");
  if (!existsSync(file)) throw new Error(".env.local não encontrado");
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return env;
}

// Secrets consumidos pelas edge functions — nunca vão para o Easypanel.
// APP_ENCRYPTION_KEY permite descriptografar integration_secrets (painel admin).
const EDGE_SECRET_KEYS = [
  "APP_ENCRYPTION_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "MERCOSULPAY_API_KEY",
  "MERCOSULPAY_WEBHOOK_SECRET",
  "MERCOSULPAY_API_URL",
  "GOOGLE_PLACES_API_KEY",
  "APIFY_API_TOKEN",
  "OPENROUTER_API_KEY",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE",
  "AI_TEXT_MODEL",
  "AI_IMAGE_MODEL",
  "AI_SITE_MODEL",
];

const env = loadLocalEnv();
const projectRef = env.SUPABASE_PROJECT_REF;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
if (!projectRef || !accessToken) {
  throw new Error("SUPABASE_PROJECT_REF e SUPABASE_ACCESS_TOKEN são obrigatórios no .env.local");
}

const cliEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken };
const cli = (args) => {
  const result = spawnSync("npx", ["supabase", ...args], {
    stdio: "inherit",
    env: cliEnv,
    shell: true,
    cwd: root,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const wantsSecrets = !process.argv.includes("--functions") || process.argv.includes("--secrets");
const wantsFunctions = !process.argv.includes("--secrets") || process.argv.includes("--functions");

if (wantsSecrets) {
  const lines = ["# Gerado por deploy-edge.mjs — não commitar (gitignored via .env*)"];
  lines.push(`APP_URL=${env.NEXT_PUBLIC_APP_URL ?? "https://seekerai.digital"}`);
  const missing = [];
  for (const key of EDGE_SECRET_KEYS) {
    if (env[key]) lines.push(`${key}=${env[key]}`);
    else missing.push(key);
  }
  const secretsFile = path.join(root, "supabase", ".env.edge");
  writeFileSync(secretsFile, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`[secrets] ${lines.length - 1} variáveis escritas em supabase/.env.edge`);
  if (missing.length) console.log(`[secrets] ausentes no .env.local: ${missing.join(", ")}`);
  cli(["secrets", "set", "--env-file", "supabase/.env.edge", "--project-ref", projectRef]);
}

if (wantsFunctions) {
  cli(["functions", "deploy", "--project-ref", projectRef]);
}

console.log("[done] edge functions e secrets sincronizados.");
