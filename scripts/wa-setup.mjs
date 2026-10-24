// Setup descartável: cria instância na Evolution, mostra QR pra escanear,
// faz polling do estado e manda mensagem-teste. Uso: node scripts/wa-setup.mjs
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const BASE = env.EVOLUTION_API_URL?.replace(/\/+$/, "");
const KEY = env.EVOLUTION_API_KEY;
if (!BASE || !KEY) { console.error("Faltam EVOLUTION_API_URL/KEY no .env.local"); process.exit(1); }

const evo = (path, opts = {}) =>
  fetch(`${BASE}${path}`, {
    ...opts,
    headers: { apikey: KEY, "Content-Type": "application/json", ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });

const api = async (path, opts) => {
  const r = await evo(path, opts);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
};

const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SeekerAi — Conectar WhatsApp</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a12;color:#eee;font-family:system-ui}
  .card{background:#151320;border:1px solid #2a2640;border-radius:16px;padding:32px;max-width:420px;width:92%;text-align:center;box-shadow:0 0 60px #7c3aed22}
  h1{font-size:20px;margin:0 0 4px} p{color:#9a93b8;font-size:13px;margin:6px 0 16px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #2a2640;background:#0b0a12;color:#eee;font-size:14px;margin-bottom:12px}
  button{width:100%;padding:12px;border:0;border-radius:10px;background:#7c3aed;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
  #qr{margin:18px auto;display:none;max-width:280px;border-radius:12px;border:8px solid #fff}
  #status{margin-top:14px;font-size:13px;min-height:18px}
  .ok{color:#4ade80}.warn{color:#fbbf24}.err{color:#f87171}
  #test{display:none;margin-top:10px;background:#16a34a}
  code{background:#0b0a12;padding:2px 6px;border-radius:6px;font-size:12px}
</style></head><body><div class="card">
<h1>📡 SeekerAi — Instância WhatsApp</h1>
<p>Conecte o número que vai enviar as mensagens da plataforma (suporte/notificações).</p>
<input id="name" value="seekerai-suporte" placeholder="nome da instância">
<button id="go">Gerar QR Code</button>
<img id="qr" alt="QR Code">
<div id="status"></div>
<button id="test">Enviar mensagem-teste pro 21968053672</button>
<p id="env" style="display:none">Depois rode:<br><code>npx supabase secrets set EVOLUTION_INSTANCE=<span id="iname"></span></code></p>
</div>
<script>
const $ = s => document.querySelector(s);
let inst = null, poll = null;
const status = (t, c) => { $("#status").innerHTML = '<span class="'+c+'">'+t+'</span>'; };
$("#go").onclick = async () => {
  inst = $("#name").value.trim();
  if (!inst) return status("Dá um nome pra instância", "err");
  $("#go").disabled = true; $("#qr").style.display = "none";
  status("Criando instância...", "warn");
  const r = await fetch("/api/create", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name: inst }) }).then(r => r.json());
  if (r.qrcode) { $("#qr").src = r.qrcode; $("#qr").style.display = "block"; status("Escaneie com o WhatsApp do número de suporte → Dispositivos conectados", "warn"); }
  else if (r.connected) { return connected(); }
  else { status(r.error || "Sem QR — tentando de novo em 3s...", "err"); setTimeout(() => $("#go").disabled = false, 3000); }
  clearInterval(poll); poll = setInterval(check, 3000);
};
async function check() {
  if (!inst) return;
  const r = await fetch("/api/status?name=" + encodeURIComponent(inst)).then(r => r.json()).catch(() => null);
  if (!r) return;
  if (r.state === "open") return connected();
  if (r.qrcode && r.qrcode !== $("#qr").src) { $("#qr").src = r.qrcode; $("#qr").style.display = "block"; }
}
function connected() {
  clearInterval(poll);
  $("#qr").style.display = "none";
  status("✅ Conectado! A instância está pronta.", "ok");
  $("#iname").textContent = inst; $("#env").style.display = "block"; $("#test").style.display = "block";
}
$("#test").onclick = async () => {
  const r = await fetch("/api/test", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name: inst }) }).then(r => r.json());
  status(r.ok ? "✅ Mensagem-teste enviada pro 21968053672!" : "❌ " + (r.error || "falhou"), r.ok ? "ok" : "err");
};
</script></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "Content-Type": type });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  try {
    if (url.pathname === "/") return send(200, HTML, "text/html; charset=utf-8");

    if (url.pathname === "/api/create" && req.method === "POST") {
      const { name } = JSON.parse(await new Promise(r => { let b = ""; req.on("data", c => b += c); req.on("end", () => r(b)); }));
      // Já existe e tá conectada?
      const st = await api(`/instance/connectionState/${name}`);
      if (st.data?.instance?.state === "open") return send(200, { connected: true });
      // Tenta criar com QR; se já existir, pede QR via connect.
      const created = await api("/instance/create", {
        method: "POST",
        body: JSON.stringify({ instanceName: name, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
      });
      const qr = created.data?.qrcode?.base64 ?? created.data?.base64;
      if (qr) return send(200, { qrcode: qr });
      const conn = await api(`/instance/connect/${name}`);
      const qr2 = conn.data?.base64 ?? conn.data?.qrcode?.base64;
      if (qr2) return send(200, { qrcode: qr2 });
      return send(200, { error: JSON.stringify(created.data).slice(0, 200) });
    }

    if (url.pathname === "/api/status") {
      const name = url.searchParams.get("name");
      const st = await api(`/instance/connectionState/${name}`);
      const state = st.data?.instance?.state;
      if (state !== "open") {
        const conn = await api(`/instance/connect/${name}`).catch(() => null);
        return send(200, { state, qrcode: conn?.data?.base64 ?? null });
      }
      return send(200, { state });
    }

    if (url.pathname === "/api/test" && req.method === "POST") {
      const { name } = JSON.parse(await new Promise(r => { let b = ""; req.on("data", c => b += c); req.on("end", () => r(b)); }));
      const r = await api(`/message/sendText/${name}`, {
        method: "POST",
        body: JSON.stringify({ number: "5521968053672", text: "✅ SeekerAi: instância de suporte conectada e funcionando!" }),
      });
      return send(200, { ok: r.status < 300, error: r.status >= 300 ? JSON.stringify(r.data).slice(0, 200) : null });
    }

    send(404, { error: "not found" });
  } catch (e) { send(500, { error: String(e).slice(0, 300) }); }
});

server.listen(4123, () => console.log("\n  📡 Abra: http://localhost:4123\n"));
