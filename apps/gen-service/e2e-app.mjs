import { createClient } from "@supabase/supabase-js";
const GEN = "https://sites-gen.olhtng.easypanel.host";
const db = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } });
const TOKEN = process.env.E2E_TOKEN;
const USER = "c85bca5b-9a03-455e-bd2a-d52b6db9e909";

const target = process.argv[2] ?? "mobile";
const prompt = process.argv[3] ?? "App de delivery de marmitas saudáveis para escritório, cardápio do dia, pedido pelo WhatsApp, visual moderno escuro com verde lima";

const { data: project, error } = await db.from("studio_projects")
  .insert({ user_id: USER, nome: "E2E " + target, prompt, target, refs: [], status: "running" })
  .select("id").single();
if (error) { console.log("project ERR:", error.message); process.exit(1); }
console.log("project:", project.id, "| target:", target);

const es = await fetch(`${GEN}/stream/${project.id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
console.log("SSE status:", es.status);
const reader = es.body.getReader();
const dec = new TextDecoder();
let buf = "";
const sseDone = (async () => {
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop();
    for (const p of parts) {
      if (!p.startsWith("data:")) continue;
      try { const e = JSON.parse(p.slice(5)); console.log(`  [${new Date().toISOString().slice(11,19)}] p=${e.p} ${e.etapa}${e.done ? " DONE" : ""}`); } catch {}
    }
  }
})();

const t0 = Date.now();
const res = await fetch(`${GEN}/ai-generate`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "generate_app", serviceSlug: "sites",
    businessRef: `studio:${project.id}`, requestRef: `studio-${project.id}`,
    lang: "pt", prompt, context: { target, refs: [] },
    jobId: project.id, jobTable: "studio_projects",
  }),
});
const data = await res.json().catch(() => ({}));
const secs = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\nHTTP ${res.status} em ${secs}s | modelo: ${data.modelo ?? "?"} | html: ${typeof data.conteudo === "string" ? data.conteudo.length + " chars" : "?"}`);
if (!res.ok) console.log("erro:", (data.erro ?? data.error ?? JSON.stringify(data)).slice(0, 300));
else {
  await db.from("studio_projects").update({ status: "done", html: data.conteudo, modelo: data.modelo ?? null, progresso: 100, etapa: "Concluída" }).eq("id", project.id);
  console.log("html salvo no projeto (simulando runJob do Next)");
}
await Promise.race([sseDone, new Promise(r => setTimeout(r, 5000))]);
