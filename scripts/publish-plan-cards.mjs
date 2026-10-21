import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const ts = require("typescript");
const source = await readFile(path.join(root, "apps/web/src/lib/plans/preview.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { previewPlanCards } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const literal = (value) => `'${value.replaceAll("'", "''")}'`;

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("Inspeção local: prepara quatro cards iniciais. --apply publica apenas drafts intactos, sem ativar cobranças.");
    return;
  }
  const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: ref, BOOTSTRAP_ADMIN_EMAIL: email } = process.env;
  if (!token || !ref || !email || !/^[a-z0-9]{20}$/.test(ref)) throw new Error("Ambiente administrativo incompleto.");
  async function query(sql) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Publicação recusada (HTTP ${response.status}); detalhes omitidos.`);
    return response.json();
  }
  const admins = await query(`select p.id from public.profiles p join auth.users u on u.id=p.id
    where lower(u.email)=${literal(email.trim().toLowerCase())} and p.role='admin'`);
  if (!admins[0]?.id) throw new Error("Titular admin não confirmado. Nenhum card será publicado.");
  const readiness = await query("select to_regprocedure('public.configure_plan_card(uuid,text,integer,integer,boolean,boolean,jsonb,integer,text)') is not null as ready");
  if (!readiness[0]?.ready) throw new Error("A migration dos cards ainda não foi aplicada.");
  await query(await readFile(path.join(root, "supabase/seed.sql"), "utf8"));
  const existing = await query("select id,slug,nome,preco_centavos,ordem,destaque,card_revision,card_content,landing_visible from public.plans");
  for (const card of previewPlanCards) {
    const row = existing.find((item) => item.slug === card.slug);
    if (!row) throw new Error("Plano inicial não encontrado.");
    if (row.card_revision !== 0 || row.landing_visible || Object.keys(row.card_content || {}).length > 0) {
      console.log(`${card.slug}: configuração existente preservada.`);
      continue;
    }
    await query(`begin;
      select set_config('request.jwt.claim.sub',${literal(admins[0].id)},true);
      select public.configure_plan_card(
        ${literal(row.id)}::uuid,${literal(row.nome)},${row.preco_centavos},${row.ordem},
        ${row.destaque},true,${literal(JSON.stringify(card.content))}::jsonb,0,
        'Publicação inicial da oferta, sem ativar cobranças'
      );
      commit;`);
    console.log(`${card.slug}: card inicial publicado com auditoria.`);
  }
  console.log("Publicação finalizada. Este script não ativa planos de cobrança nem altera configurações já editadas.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha de publicação."); process.exitCode = 1; });
