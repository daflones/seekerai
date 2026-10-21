import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");
const args = new Set(process.argv.slice(2));
const steps = ["schema", "auth", "admin"].filter((step) => args.has(`--${step}`));

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}.`);
  return value;
}
function sqlLiteral(value) { return `'${value.replaceAll("'", "''")}'`; }

async function main() {
  if (!args.has("--apply")) {
    console.log("Inspeção local, sem rede. Após autorização, --apply --schema --auth --admin:");
    console.log("- aplica migrations pendentes em transações e registra versões;");
    console.log("- habilita confirmação de e-mail e CAPTCHA nativo Turnstile no Supabase;");
    console.log("- cria a conta admin sem enviar e-mail; nunca redefine uma senha existente;");
    console.log("- promove o perfil por RPC service-only e registra auditoria;");
    console.log("- não apaga tabelas, não reseta banco e não aceita Termos pelo usuário.");
    console.log("Senha somente via BOOTSTRAP_ADMIN_PASSWORD no ambiente temporário do processo.");
    return;
  }
  if (!steps.length) throw new Error("Selecione explicitamente --schema, --auth e/ou --admin.");
  const ref = env("SUPABASE_PROJECT_REF");
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error("Referência de projeto inválida.");
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  if (new URL(url).origin !== `https://${ref}.supabase.co`) throw new Error("URL e referência do projeto não correspondem.");
  const accessToken = env("SUPABASE_ACCESS_TOKEN");
  const origin = new URL(env("NEXT_PUBLIC_APP_URL")).origin;
  if (!origin.startsWith("https://")) throw new Error("A URL pública deve usar HTTPS.");
  const adminKey = process.env.SUPABASE_SECRET_KEY || env("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });

  async function management(suffix, method = "GET", body) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/${suffix}`, {
      method, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Management API recusou ${suffix} (HTTP ${response.status}). Resposta sensível omitida.`);
    return response.json();
  }
  async function query(sql) {
    return management("database/query", "POST", { query: sql });
  }

  if (args.has("--schema")) {
    await query(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key, statements text[], name text
      );
    `);
    const applied = await query("select version from supabase_migrations.schema_migrations");
    const versions = new Set(applied.map((row) => row.version));
    const directory = path.join(root, "supabase/migrations");
    for (const file of (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
      const [version] = file.split("_");
      if (versions.has(version)) { console.log(`Migration ${version}: já registrada, preservada.`); continue; }
      const sql = await readFile(path.join(directory, file), "utf8");
      const statements = sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
      const name = file.slice(version.length + 1, -4);
      await query(`begin;\n${statements}\ninsert into supabase_migrations.schema_migrations (version, name, statements)
        values (${sqlLiteral(version)}, ${sqlLiteral(name)}, array[${sqlLiteral(sql)}]);\ncommit;`);
      console.log(`Migration ${version}: aplicada e registrada.`);
    }
  }

  // Refuse to create an auth account before the role/consent/rate-limit schema exists.
  const check = await query(`select
    to_regprocedure('public.grant_admin_access(uuid)') is not null as admin_rpc,
    to_regprocedure('public.check_auth_rate_limit(text,integer,integer)') is not null as rate_rpc,
    exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'profiles' and column_name = 'terms_version') as consent_schema;`);
  if (!check[0]?.admin_rpc || !check[0]?.rate_rpc || !check[0]?.consent_schema) {
    throw new Error("Schema de autenticação incompleto; nenhuma conta será criada.");
  }

  if (args.has("--auth")) {
    const config = await management("config/auth");
    const existing = (config.uri_allow_list || "").split(",").map((value) => value.trim()).filter(Boolean);
    const callbacks = [origin, "http://localhost:3000", "http://127.0.0.1:3000"]
      .flatMap((base) => [`${base}/auth/callback**`, `${base}/auth/confirm**`]);
    await management("config/auth", "PATCH", {
      site_url: origin,
      uri_allow_list: [...new Set([...existing, ...callbacks])].join(","),
      external_email_enabled: true,
      mailer_autoconfirm: false,
      password_min_length: 8,
      security_captcha_enabled: true,
      security_captcha_provider: "turnstile",
      security_captcha_secret: env("TURNSTILE_SECRET_KEY"),
    });
    const verified = await management("config/auth");
    if (verified.security_captcha_enabled !== true || verified.security_captcha_provider !== "turnstile" || verified.mailer_autoconfirm !== false) {
      throw new Error("A configuração de captcha/confirmação não foi confirmada.");
    }
    console.log("Auth: confirmação de e-mail e Turnstile nativo configurados. Configuração sensível omitida.");
  }

  if (args.has("--admin")) {
    const email = env("BOOTSTRAP_ADMIN_EMAIL").trim().toLowerCase();
    const password = env("BOOTSTRAP_ADMIN_PASSWORD");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) throw new Error("Dados do bootstrap inválidos.");
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: "Administrador" },
    });
    let user = data?.user;
    if (error) {
      if (!["email_exists", "user_already_exists"].includes(error.code || "")) {
        throw new Error(`Falha ao provisionar usuário (${error.code || "erro"}). Detalhes omitidos.`);
      }
      for (let page = 1; page <= 20 && !user; page++) {
        const result = await supabase.auth.admin.listUsers({ page, perPage: 100 });
        if (result.error) throw new Error("Não foi possível consultar o usuário existente.");
        user = result.data.users.find((item) => item.email?.toLowerCase() === email);
        if (result.data.users.length < 100) break;
      }
      console.log("Conta já existente: senha e confirmação anteriores foram preservadas.");
    }
    if (!user?.id || !user.email_confirmed_at) throw new Error("A conta precisa existir e ter e-mail confirmado antes da promoção.");
    const { error: promotionError } = await supabase.rpc("grant_admin_access", { p_user: user.id });
    if (promotionError) throw new Error("Conta criada/encontrada, mas promoção não concluída. Nenhuma senha foi redefinida.");
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profileError || profile?.role !== "admin") throw new Error("Não foi possível confirmar a role administrativa.");
    console.log("Perfil admin confirmado no banco. Aceite de Termos fica para o primeiro acesso do titular.");
  }

  if (args.has("--auth") && args.has("--admin")) {
    env("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    env("AUTH_RATE_LIMIT_SECRET");
    const file = path.join(root, ".env.local");
    let local = await readFile(file, "utf8");
    local = /^SUPABASE_AUTH_READY=/m.test(local)
      ? local.replace(/^SUPABASE_AUTH_READY=.*$/m, "SUPABASE_AUTH_READY=true")
      : `${local}\nSUPABASE_AUTH_READY=true\n`;
    await writeFile(file, local);
    console.log("Ambiente local liberado. Reinicie o dev server. No deploy, configure as mesmas variáveis no serviço.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha de provisionamento; detalhes omitidos.");
  process.exitCode = 1;
});
