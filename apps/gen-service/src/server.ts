// Gen Service — gerações de IA do SeekerAi fora das Edge Functions.
// Mesmo contrato do ai-generate (POST /ai-generate) + SSE /stream/:jobId
// pro feed de progresso em tempo real. Auth: JWT do Supabase (mesmo
// requireUser da edge) — nada de token interno novo.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { handle } from "./generate.ts";
import { recentJobEvents, subscribeJob, clearJobEvents, type JobEvent } from "./bus.ts";
import { asString, isRecord, serviceClient } from "./common.ts";

const PORT = Number(process.env.PORT ?? 8080);
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function sseAuth(req: IncomingMessage): Promise<{ id: string } | null> {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : { id: data.user.id };
}

// O job precisa ser do usuário — ai_jobs e studio_projects carregam user_id.
async function ownsJob(userId: string, jobId: string): Promise<boolean> {
  const db = serviceClient();
  const [{ data: a }, { data: s }] = await Promise.all([
    db.from("ai_jobs").select("id").eq("id", jobId).eq("user_id", userId).maybeSingle(),
    db.from("studio_projects").select("id").eq("id", jobId).eq("user_id", userId).maybeSingle(),
  ]);
  return Boolean(a || s);
}

function sseWrite(res: ServerResponse, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function streamJob(req: IncomingMessage, res: ServerResponse, jobId: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
  // Replay do buffer em memória + assinatura ao vivo.
  for (const e of recentJobEvents(jobId)) sseWrite(res, e);
  const unsub = subscribeJob(jobId, (e) => sseWrite(res, e));
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => { clearInterval(ping); unsub(); });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname.startsWith("/stream/")) {
      const jobId = url.pathname.slice("/stream/".length);
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
        res.writeHead(400).end(JSON.stringify({ erro: "jobId inválido" }));
        return;
      }
      const user = await sseAuth(req);
      if (!user || !(await ownsJob(user.id, jobId))) {
        res.writeHead(401).end(JSON.stringify({ erro: "Sessão inválida" }));
        return;
      }
      streamJob(req, res, jobId);
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
      return;
    }

    // POST /ai-generate — mesmo contrato da edge. Bufferiza o body pra
    // espiar jobId/action e emitir evento terminal pro SSE no fim.
    const bodyBuf = await readBody(req);
    let jobId: string | null = null;
    let action: string | null = null;
    try {
      const peek = JSON.parse(bodyBuf.toString("utf8"));
      if (isRecord(peek)) {
        jobId = asString(peek.jobId, 40);
        action = asString(peek.action, 40);
      }
    } catch { /* handle() devolve o 400 de JSON inválido */ }

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    const request = new Request(`http://gen.local${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: bodyBuf.length ? new Uint8Array(bodyBuf) : undefined,
    });
    const response = await handle(request);

    // Evento terminal pro SSE — a UI fecha o feed sem esperar o poll.
    if (jobId && (action === "generate_app" || action === "generate_site")) {
      const terminal: JobEvent & { done?: boolean; erro?: string } = {
        p: response.ok ? 100 : 0,
        etapa: response.ok ? "Concluída" : "Falhou",
        at: new Date().toISOString(),
        done: response.ok,
      };
      if (!response.ok) {
        const clone = response.clone();
        const data = await clone.json().catch(() => null) as Record<string, unknown> | null;
        terminal.erro = asString(data?.erro, 300) ?? asString(data?.error, 300) ?? `HTTP ${response.status}`;
      }
      const { emitJobEvent } = await import("./bus.ts");
      emitJobEvent(jobId, terminal.p, terminal.etapa, { done: terminal.done, erro: terminal.erro });
      if (response.ok) setTimeout(() => clearJobEvents(jobId), 60_000);
    }

    const outHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { outHeaders[k] = v; });
    res.writeHead(response.status, outHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error("[gen-service] erro:", err instanceof Error ? err.message : err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ erro: "Falha interna" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[gen-service] ouvindo na porta ${PORT}`);
});
