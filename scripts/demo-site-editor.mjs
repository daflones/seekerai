// Cria um usuário + site de demonstração pro editor visual e imprime
// o link de login direto (auth/confirm → editor). NÃO limpa — o usuário
// fica no banco pra testar à vontade; delete manualmente depois.
// Uso: node scripts/demo-site-editor.mjs
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.E2E_APP ?? "http://127.0.0.1:3000";
const TS = Date.now();
const EMAIL = `demo-editor-${TS}@seekerai.digital`;
const SLUG = `demo-editor-${TS}`;

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const rest = (path, opts = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, { ...opts, headers: { ...svc, Prefer: "return=representation", ...(opts.headers ?? {}) } });

const user = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
  method: "POST", headers: svc,
  body: JSON.stringify({ email: EMAIL, password: `Demo!${TS}`, email_confirm: true, user_metadata: { nome: "Demo Editor" } }),
})).json();
if (!user?.id) { console.error("falha ao criar usuário", user); process.exit(1); }

const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Barbearia Demo</title>
<style>
  *{margin:0;box-sizing:border-box;font-family:Georgia,serif}
  body{background:#141014;color:#f0e8dd}
  .hero{padding:90px 8vw;background:linear-gradient(135deg,#241a2e,#120d18)}
  .hero small{color:#c9a35c;letter-spacing:4px}
  .hero h1{font-size:clamp(34px,6vw,64px);margin:14px 0;max-width:14ch}
  .hero p{color:#bfb2a8;max-width:52ch;line-height:1.7}
  .cta{display:inline-block;margin-top:26px;padding:15px 34px;border-radius:999px;
    background:#c9a35c;color:#17110a;text-decoration:none;font-weight:700}
  .gal{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:40px 8vw}
  .gal img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px;display:block}
  .svc{padding:30px 8vw 80px}
  .svc h2{font-size:30px;margin-bottom:18px}
  .row{display:flex;justify-content:space-between;padding:15px 4px;border-bottom:1px solid #ffffff1c}
  .row span:last-child{color:#c9a35c}
</style></head><body>
<section class="hero">
  <small>BARBEARIA DEMO — OSASCO</small>
  <h1>Corte clássico, visual impecável.</h1>
  <p>Tradição e precisão em cada detalhe. Agende seu horário e saia pronto pra qualquer ocasião.</p>
  <a class="cta" href="https://wa.me/5511999990000">Agendar pelo WhatsApp</a>
</section>
<div class="gal">
  <img src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=600" alt="corte">
  <img src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600" alt="barba">
  <img src="https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600" alt="salao">
</div>
<section class="svc">
  <h2>Serviços</h2>
  <div class="row"><span>Corte clássico</span><span>R$ 45</span></div>
  <div class="row"><span>Barba completa</span><span>R$ 35</span></div>
  <div class="row"><span>Corte + barba</span><span>R$ 70</span></div>
</section>
</body></html>`;

await rest("sites", {
  method: "POST",
  body: JSON.stringify({
    slug: SLUG, tipo: "custom", nome: "Barbearia Demo",
    config: { tipo: "custom", nome: "Barbearia Demo", lang: "pt", owner: user.id, html },
    publicado: true, sem_expiracao: true,
  }),
});

const link = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
  method: "POST", headers: svc,
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
})).json();

console.log(`\nUsuário:  ${EMAIL}  (senha Demo!${TS})`);
console.log(`Site:     ${APP}/site/${SLUG}`);
console.log(`Editor:   ${APP}/app/sites/${SLUG}/editar`);
console.log(`\nLogin direto pro editor (1 clique):\n`);
console.log(`${APP}/auth/confirm?token_hash=${encodeURIComponent(link.hashed_token)}&type=email&next=${encodeURIComponent(`/app/sites/${SLUG}/editar`)}`);
