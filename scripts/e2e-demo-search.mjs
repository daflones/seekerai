// E2E da demonstração pública (/api/demo/search).
// Sobe com o dev server (npm run dev na porta 3000) e valida:
// amostra GET, 3 buscas com cookie, 4ª negada, mascaramento de
// contatos, site aleatório e validação de entrada.
// Uso: node scripts/e2e-demo-search.mjs
const BASE = process.env.DEMO_BASE ?? "http://localhost:3000";
const ORIGIN = { Origin: BASE };
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(" ✅", name); }
  else { fail++; console.log(" ❌", name, extra); }
};

const jar = new Map();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
function storeCookies(res) {
  for (const h of res.headers.getSetCookie?.() ?? []) {
    const [pair] = h.split(";"); const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function call(method, body) {
  const res = await fetch(`${BASE}/api/demo/search`, {
    method,
    headers: { "Content-Type": "application/json", ...ORIGIN, Cookie: cookieHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  return { status: res.status, data: await res.json().catch(() => null) };
}

// 1. Amostra GET — sem consumir cota
const sample = await call("GET");
ok("GET amostra 200", sample.status === 200);
ok("GET traz leads reais", Array.isArray(sample.data?.leads) && sample.data.leads.length >= 3);
ok("GET não consome cota", sample.data?.restante === 3, `restante=${sample.data?.restante}`);

const l0 = sample.data?.leads?.[0] ?? {};
ok("lead tem nome real", typeof l0.nome === "string" && l0.nome.length > 2);
ok("whatsapp mascarado", !l0.whatsapp || l0.whatsapp.includes("••••"));
ok("instagram mascarado", !l0.instagram || /^@.••••$/.test(l0.instagram));
ok("sem URL de site exposta", !("site" in l0) && !("mapsUrl" in l0) && !("telefone" in l0) && !("ig" in l0));
ok("site exemplo presente", typeof sample.data?.site?.slug === "string" && sample.data.site.slug.length > 2);

// 2. Validação de entrada
const bad = await call("POST", { query: "x", regionCode: "BR" });
ok("query curta rejeitada", bad.status === 400);
const noOrigin = await fetch(`${BASE}/api/demo/search`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
  body: JSON.stringify({ query: "padaria em pinheiros", regionCode: "BR" }),
});
ok("origem externa bloqueada", noOrigin.status === 403);

// 3. Três buscas com cookie → 4ª negada
for (let i = 1; i <= 4; i++) {
  const r = await call("POST", { query: `academia em Copacabana, Rio de Janeiro ${i}`, regionCode: "BR" });
  if (i <= 3) {
    ok(`busca ${i} ok`, r.status === 200 && r.data?.restante === 3 - i, `status=${r.status} restante=${r.data?.restante}`);
    ok(`busca ${i} mascarada`, (r.data?.leads ?? []).every((l) => !l.whatsapp || l.whatsapp.includes("••••")));
    ok(`busca ${i} sem perfil IG`, (r.data?.leads ?? []).every((l) => !("ig" in l) && !("telefone" in l)));
  } else {
    ok("4ª busca negada", r.status === 403 && r.data?.limit === true, `status=${r.status}`);
  }
}

// 4. Cookie adulterado não reseta a cota do servidor? — cookie inválido
//    volta a 3 (a cota por IP segura o abuso); só garante que não estoura.
jar.set("seeker_demo", "99.forged");
const forged = await call("POST", { query: "petshop em moema", regionCode: "BR" });
ok("cookie forjado não aumenta cota", forged.status === 403 || (forged.data?.restante ?? 99) <= 2, `status=${forged.status} restante=${forged.data?.restante}`);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
