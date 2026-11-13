import { createClient } from "@supabase/supabase-js";
const GEN = "https://sites-gen.olhtng.easypanel.host";
const db = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } });
const TOKEN = process.env.E2E_TOKEN;
const USER = "c85bca5b-9a03-455e-bd2a-d52b6db9e909";

const query = process.argv[2] ?? "Barbearias em São Paulo, SP";
const serviceSlug = process.argv[3] ?? "sites";

// job row (como a rota Next faz)
const { data: job, error } = await db.from("search_jobs")
  .insert({ user_id: USER, payload: { query, serviceSlug, requestRef: crypto.randomUUID(), regionCode: "BR" }, status: "running" })
  .select("id").single();
if (error) { console.log("job ERR:", error.message); process.exit(1); }
console.log("job:", job.id, "| query:", query);

// SSE watcher
const es = await fetch(`${GEN}/stream/${job.id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
console.log("SSE status:", es.status);
let sseLines = 0;
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
      sseLines++;
      try {
        const e = JSON.parse(p.slice(5));
        const extra = e.achados ? ` [+${e.achados.length} achados]` : "";
        console.log(`  [${new Date().toISOString().slice(11,19)}] p=${e.p} ${e.etapa}${extra}${e.done ? " DONE" : ""}`);
      } catch { /* ping */ }
    }
  }
})();

const t0 = Date.now();
const res = await fetch(`${GEN}/places-search`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, serviceSlug, requestRef: crypto.randomUUID(), jobId: job.id, regionCode: "BR" }),
});
const data = await res.json().catch(() => ({}));
console.log(`\nHTTP ${res.status} em ${((Date.now() - t0) / 1000).toFixed(1)}s | provedor: ${data.provedor} | resultados: ${data.resultados?.length ?? "?"} | creditos: ${data.creditosCobrados}`);
if (!res.ok) console.log("erro:", data.erro ?? data.error ?? JSON.stringify(data).slice(0, 300));
else {
  const prios = {};
  for (const p of data.resultados ?? []) prios[p.prioridade ?? "?"] = (prios[p.prioridade ?? "?"] ?? 0) + 1;
  console.log("prioridades:", JSON.stringify(prios));
  const top = (data.resultados ?? []).slice(0, 5).map(p => `${p.nome} | ig:${p.instagram ? "sim" : "não"} | site:${p.site ? "sim" : "NÃO"} | prio:${p.prioridade}`);
  console.log(top.join("\n"));
}
await sseDone;
console.log("eventos SSE recebidos:", sseLines);
// confere eventos persistidos
const { data: j2 } = await db.from("search_jobs").select("status,progresso,etapa,eventos").eq("id", job.id).single();
console.log("DB final:", j2?.status, j2?.progresso, "| eventos no banco:", Array.isArray(j2?.eventos) ? j2.eventos.length : "?");
