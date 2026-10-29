// Dá o pacote de boas-vindas (13 créditos) retroativo para usuários
// elegíveis: saldo 0, sem pagamento confirmado e sem atividade
// (sem credit_operations e sem leads — "nunca comprou, nunca fez nada").
// Idempotente via ref welcome-pack:<user>.
// Uso: node scripts/grant-welcome-pack.mjs        → dry-run (só conta)
//      node scripts/grant-welcome-pack.mjs --apply → aplica de verdade
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
const AMOUNT = 13;
const MOTIVO = "Pacote de boas-vindas: 1 busca + 1 site + 1 mensagem + 1 estrategia";

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const get = async (path) => (await fetch(`${SUPA}/rest/v1/${path}`, { headers: svc })).json();
const rpc = (fn, body) =>
  fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers: svc, body: JSON.stringify(body) });

// Paginação simples (conta pequena, mas robusto).
async function all(path) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const page = await fetch(`${SUPA}/rest/v1/${path}${path.includes("?") ? "&" : "?"}offset=${off}`, {
      headers: { ...svc, Range: `${off}-${off + 999}` },
    });
    const rows = await page.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const [wallets, paid, ops, leads] = await Promise.all([
  all("credit_wallets?select=user_id,saldo&saldo=eq.0"),
  all("payments?status=eq.paid&select=user_id"),
  all("credit_operations?select=user_id"),
  all("leads?select=user_id"),
]);
const paidSet = new Set(paid.map((r) => r.user_id));
const opsSet = new Set(ops.map((r) => r.user_id));
const leadSet = new Set(leads.map((r) => r.user_id));

const eligible = wallets.filter(
  (w) => !paidSet.has(w.user_id) && !opsSet.has(w.user_id) && !leadSet.has(w.user_id),
);

console.log(`wallets zeradas: ${wallets.length}`);
console.log(`com pagamento confirmado: ${paidSet.size}`);
console.log(`com operação de crédito: ${opsSet.size}`);
console.log(`com leads: ${leadSet.size}`);
console.log(`elegíveis (zerado + nunca comprou + nunca fez nada): ${eligible.length}`);

if (!APPLY) {
  console.log("\ndry-run — rode com --apply pra creditar de verdade.");
  process.exit(0);
}

let done = 0, skipped = 0, failed = 0;
for (const w of eligible) {
  const res = await rpc("apply_credit_delta", {
    p_user: w.user_id, p_delta: AMOUNT, p_motivo: MOTIVO, p_ref: `welcome-pack:${w.user_id}`,
  });
  if (res.ok) {
    done++;
    const body = await res.json().catch(() => null);
    if (body === AMOUNT) process.stdout.write(".");
  } else {
    const body = await res.json().catch(() => ({}));
    // Conflito de idempotência = já creditado antes — conta como skip.
    if (/conflict|Conflict/i.test(body.message ?? "")) skipped++;
    else { failed++; console.log(`\nERRO ${w.user_id}: ${JSON.stringify(body).slice(0, 160)}`); }
  }
}
console.log(`\n${done} creditados (+${AMOUNT}) · ${skipped} já tinham · ${failed} falhas`);
