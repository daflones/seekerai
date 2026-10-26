#!/usr/bin/env node
// SeekerAi — bot de prospecção local (só sua conta).
//
// Pipeline em fila, resumível (scripts/prospect-state.json):
//   1) search   — Serper /maps busca "barbearia" em ~30 cidades → ~500 leads
//   2) save     — upsert na tabela `leads` (user_id do dono)
//   3) sites    — gera /site/<slug> via edge ai-generate (generate_site)
//   4) messages — abordagem via ai-generate (sales_reply)
//   5) send     — fila 1 msg a cada 6–10 min pela Evolution → status "contatado"
//   6) report   — resumo final no seu WhatsApp
//
// Uso:
//   node scripts/prospect-bot.mjs                 — roda a fila inteira
//   node scripts/prospect-bot.mjs --search-only   — só busca e salva leads
//   node scripts/prospect-bot.mjs --send-only     — só drena a fila de envio
//   node scripts/prospect-bot.mjs --limit 100     — limita nº de leads
//   node scripts/prospect-bot.mjs --reset         — zera o estado e recomeça
//
// Login: SEEKERAI_EMAIL / SEEKERAI_PASSWORD no .env.local (ou o script pergunta).
// O token expira em ~1h — o bot renova sozinho pelo refresh_token.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import readline from "node:readline";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = join(ROOT, "scripts", "prospect-state.json");

// ----------------------------- config ---------------------------------
const CFG = {
  LIMIT: num(process.env.BOT_LIMIT, 500),
  SERVICE_SLUG: "sites",
  SERVICE_NAME: "criação de sites",
  NICHOS: ["barbearia"],
  SEND_MIN_MS: 6 * 60_000,
  SEND_MAX_MS: 10 * 60_000,
  SITE_CONCURRENCY: 2,          // gerações de site em paralelo
  EDGE_TIMEOUT_MS: 380_000,     // site pode demorar minutos no fallback
  // Instância que envia: o +57 colombiano NÃO entrega pra contas BR migradas
  // (LID) e novo número frio toma ban rápido. Default = seu número BR.
  INSTANCE: process.env.EVOLUTION_INSTANCE || "iastetic-admin-1c15d6df",
  OWNER_NUMBER: process.env.OWNER_WHATSAPP || "29421146759233", // seu LID
  OWNER_COPY: true,             // cópia de cada abordagem no seu WhatsApp
  USER_ID: "372aebc6-2f78-4dc0-a20c-1869ec7a4cef", // seu perfil admin
};

// ~30 cidades espalhadas pelos estados — cobertura nacional.
const CIDADES = [
  ["São Paulo", "SP"], ["Rio de Janeiro", "RJ"], ["Belo Horizonte", "MG"],
  ["Salvador", "BA"], ["Fortaleza", "CE"], ["Recife", "PE"],
  ["Porto Alegre", "RS"], ["Curitiba", "PR"], ["Florianópolis", "SC"],
  ["Brasília", "DF"], ["Goiânia", "GO"], ["Belém", "PA"],
  ["Manaus", "AM"], ["São Luís", "MA"], ["Natal", "RN"],
  ["João Pessoa", "PB"], ["Maceió", "AL"], ["Aracaju", "SE"],
  ["Campo Grande", "MS"], ["Cuiabá", "MT"], ["Vitória", "ES"],
  ["Teresina", "PI"], ["Palmas", "TO"], ["Porto Velho", "RO"],
  ["Rio Branco", "AC"], ["Boa Vista", "RR"], ["Macapá", "AP"],
  ["Campinas", "SP"], ["Santos", "SP"], ["Ribeirão Preto", "SP"],
  ["Guarulhos", "SP"], ["Niterói", "RJ"], ["Uberlândia", "MG"],
  ["Joinville", "SC"], ["Londrina", "PR"],
];

// ----------------------------- env/auth --------------------------------
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^"|"$/g, "").trim()]),
);
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SB_SERVICE = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const SERPER = env.SERPER_API_KEY;
const EVO_URL = env.EVOLUTION_API_URL;
const EVO_KEY = env.EVOLUTION_API_KEY;
const APP_URL = env.NEXT_PUBLIC_APP_URL || "https://seekerai.digital";

const SH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };

let session = null; // {access_token, refresh_token, expires_at}
async function promptCreds() {
  if (env.SEEKERAI_EMAIL && env.SEEKERAI_PASSWORD) {
    return { email: env.SEEKERAI_EMAIL, password: env.SEEKERAI_PASSWORD };
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((r) => rl.question(q, r));
  const email = await ask("Seu e-mail do SeekerAi: ");
  const password = await ask("Sua senha: ");
  rl.close();
  return { email: email.trim(), password };
}

function setSession(d, idFallback) {
  session = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + ((d.expires_in ?? 3600) - 60) * 1000,
  };
  log(`logado como ${d.user?.email ?? idFallback}`);
  if (d.user?.id && d.user.id !== CFG.USER_ID) {
    log(`AVISO: user ${d.user.id} != USER_ID configurado — ajuste CFG.USER_ID`);
    CFG.USER_ID = d.user.id;
  }
}

async function login() {
  // Sem senha: a Admin API (service key local) emite um magiclink do dono
  // e /verify vira sessão real — o bot roda 100% autônomo.
  const u = await fetch(`${SB_URL}/auth/v1/admin/users/${CFG.USER_ID}`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  }).then((r) => r.json()).catch(() => null);
  if (u?.email) {
    const gl = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email: u.email }),
    }).then((r) => r.json()).catch(() => null);
    if (gl?.hashed_token) {
      const d = await fetch(`${SB_URL}/auth/v1/verify`, {
        method: "POST",
        headers: { apikey: SB_ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "magiclink", token_hash: gl.hashed_token }),
      }).then((r) => r.json()).catch(() => null);
      if (d?.access_token) return setSession(d, u.email);
    }
  }
  log("sessão via Admin API falhou — caindo pra email/senha");
  const { email, password } = await promptCreds();
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) die(`Login falhou: ${JSON.stringify(d)}`);
  setSession(d);
}

async function token() {
  if (Date.now() > session.expires_at) {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SB_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) return login(); // refresh morreu → reloga
    session = {
      access_token: d.access_token,
      refresh_token: d.refresh_token ?? session.refresh_token,
      expires_at: Date.now() + (d.expires_in - 60) * 1000,
    };
  }
  return session.access_token;
}

// ----------------------------- estado ----------------------------------
function loadState() {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { /* corrompido → recomeça */ }
  }
  return { found: [], leads: {}, queue: [], sent: 0, failed: 0, phase: "search" };
}
function saveState(st) {
  writeFileSync(STATE_FILE, JSON.stringify(st, null, 1));
}
// leads: { [placeId]: {leadId, nome, telefone, etapa: "saved"|"site"|"msg"|"queued"|"sent"|"failed", siteUrl?, msg?} }

// ----------------------------- helpers ---------------------------------
function log(...a) { console.log(`[${new Date().toLocaleTimeString("pt-BR")}]`, ...a); }
function die(msg) { console.error("FATAL:", msg); process.exit(1); }
function num(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => min + Math.floor(Math.random() * (max - min));

function toE164(raw, cc = "55") {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00")) {
    const d = digits.slice(2);
    return d.length >= 10 && d.length <= 15 ? d : null;
  }
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.length >= 12) return digits;
  const rest = digits.length - cc.length;
  if (digits.startsWith(cc) && rest >= 8 && rest <= 11) return digits;
  return `${cc}${digits}`;
}

// ----------------------------- Serper ----------------------------------
async function serperMaps(q, page = 1) {
  const r = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: { "X-API-KEY": SERPER, "Content-Type": "application/json" },
    body: JSON.stringify({ q, gl: "br", hl: "pt-br", num: 20, page }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (!r?.ok) return [];
  const d = await r.json().catch(() => ({}));
  return Array.isArray(d.places) ? d.places : [];
}

async function phaseSearch(state) {
  log(`buscando barbearias em ${CIDADES.length} cidades (alvo: ${CFG.LIMIT})…`);
  const seen = new Set(state.found.map((f) => f.cid || f.phone || `${f.title}|${f.address}`));
  // buffer pra absorver leads sem telefone/falhas — pequeno em runs curtas
  const buffer = Math.min(40, Math.ceil(CFG.LIMIT / 2));
  outer: for (const [cidade, uf] of CIDADES) {
    for (let page = 1; page <= 2 && state.found.length < CFG.LIMIT + buffer; page++) {
      const places = await serperMaps(`barbearia ${cidade} ${uf}`, page);
      for (const p of places) {
        const key = p.cid || p.phoneNumber || `${p.title}|${p.address}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        state.found.push({
          cid: p.cid ?? null,
          title: p.title ?? null,
          address: p.address ?? null,
          phone: p.phoneNumber ?? null,
          rating: p.rating ?? null,
          ratingCount: p.ratingCount ?? null,
          website: p.website ?? null,
          lat: p.latitude ?? null,
          lng: p.longitude ?? null,
          cidade, uf,
        });
      }
      log(`  ${cidade}/${uf} p${page}: +${places.length} (total ${state.found.length})`);
      if (!places.length) break;
      await sleep(jitter(700, 1500));
      if (state.found.length >= CFG.LIMIT + buffer) break outer;
    }
  }
  state.found = state.found.slice(0, CFG.LIMIT + buffer);
  state.phase = "enrich";
  saveState(state);
  log(`busca concluída: ${state.found.length} estabelecimentos únicos`);
}

// --------------------------- Instagram ----------------------------------
const IG_RE = /instagram\.com\/(?!p\/|reel|explore|stories|accounts)([A-Za-z0-9_.]{2,30})/i;

function igHandle(url) {
  const m = typeof url === "string" ? url.match(IG_RE) : null;
  return m ? `@${m[1].replace(/\.$/, "")}` : null;
}

/** Prioridade: tem Instagram E não tem site → primeiro (o site gerado usa
    as fotos reais do IG — o pitch fica muito melhor). Sem site sem IG
    depois; quem já tem site por último. */
async function phaseEnrich(state) {
  let comIg = 0, descobertos = 0;
  for (const f of state.found) {
    if (f.igDone) { if (f.instagram) comIg++; continue; }
    // website que É o instagram → não conta como site
    const fromSite = igHandle(f.website);
    if (fromSite) { f.instagram = fromSite; f.website = null; }
    if (!f.instagram && !f.website) {
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": SERPER, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `site:instagram.com "${f.title}" ${f.cidade} ${f.uf}`, gl: "br", hl: "pt-br", num: 5 }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      if (r?.ok) {
        const d = await r.json().catch(() => ({}));
        const links = (d.organic ?? []).map((o) => o.link);
        const hit = links.map(igHandle).find(Boolean);
        if (hit) { f.instagram = hit; descobertos++; }
      }
      await sleep(jitter(300, 700));
    }
    if (f.instagram) comIg++;
    f.igDone = true;
  }
  // ordenação: 0 = IG + sem site | 1 = sem site sem IG | 2 = já tem site
  for (const f of state.found) {
    f.prio = f.instagram && !f.website ? 0 : !f.website ? 1 : 2;
  }
  state.found.sort((a, b) => (a.prio ?? 2) - (b.prio ?? 2));
  saveState(state);
  state.phase = "save";
  log(`instagram: ${comIg} com IG (${descobertos} descobertos na busca) — fila priorizada`);
}

// ----------------------------- leads -----------------------------------
async function phaseSave(state) {
  let saved = 0, skipped = 0;
  for (const f of state.found) {
    const k = f.cid || f.phone || `${f.title}|${f.address}`;
    if (state.leads[k]?.leadId) { skipped++; continue; }
    if (!f.title) continue;
    const body = {
      user_id: CFG.USER_ID,
      service_slug: CFG.SERVICE_SLUG,
      place_id: f.cid,
      nome: f.title.slice(0, 200),
      endereco: (f.address ?? "").slice(0, 500) || null,
      cidade: f.cidade,
      uf: f.uf,
      telefone: f.phone?.slice(0, 40) ?? null,
      site: f.website?.slice(0, 500) ?? null,
      avaliacao: typeof f.rating === "number" ? f.rating : null,
      total_avaliacoes: f.ratingCount ?? null,
      categoria: "barbearia",
      maps_url: f.cid ? `https://maps.google.com/?cid=${f.cid}` : null,
      lat: f.lat, lng: f.lng,
      whatsapp: f.phone ? "sim" : "nao",
      instagram: f.instagram ?? null,
      dados: { pais: "BR", fonte: "prospect-bot", instagram: f.instagram ?? null },
    };
    // upsert no par (user_id, place_id) — duplicado devolve [] e cai no
    // lookup abaixo; 409 (conflito fora do upsert) também vira lookup.
    const r = await fetch(`${SB_URL}/rest/v1/leads?on_conflict=user_id,place_id`, {
      method: "POST",
      headers: { ...SH, Prefer: "return=representation,resolution=ignore-duplicates" },
      body: JSON.stringify(body),
    });
    const rows = await r.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row?.id) { state.leads[k] = { leadId: row.id, nome: f.title, telefone: f.phone, etapa: "saved" }; saved++; }
    else if (f.cid) { // duplicado — busca o id existente e segue o pipeline
      const q = await fetch(`${SB_URL}/rest/v1/leads?user_id=eq.${CFG.USER_ID}&place_id=eq.${f.cid}&select=id,status,dados,instagram&limit=1`, { headers: SH });
      const [ex] = await q.json().catch(() => []);
      if (ex?.id) {
        // lead já com site: pula geração e vai direto pra mensagem
        const done = ex.dados?.siteSlug;
        state.leads[k] = { leadId: ex.id, nome: f.title, telefone: f.phone,
          etapa: done ? "site" : "saved",
          ...(done ? { siteUrl: `${APP_URL}/site/${done}` } : {}) };
        skipped++;
        // IG descoberto agora → completa o lead antigo (site usa as fotos)
        if (f.instagram && !ex.instagram) {
          await fetch(`${SB_URL}/rest/v1/leads?id=eq.${ex.id}`, {
            method: "PATCH", headers: SH,
            body: JSON.stringify({ instagram: f.instagram, dados: { ...(ex.dados ?? {}), instagram: f.instagram } }),
          });
        }
      }
    } else if (r.ok) { skipped++; } else {
      log(`  save falhou (${r.status}): ${f.title} — ${JSON.stringify(rows).slice(0, 120)}`);
    }
    if ((saved + skipped) % 25 === 0) { saveState(state); log(`  leads salvos: ${saved} novos / ${skipped} existentes`); }
  }
  saveState(state);
  state.phase = "sites";
  log(`leads: ${saved} novos + ${skipped} existentes = ${Object.keys(state.leads).length} na fila`);
}

// ----------------------------- edge ------------------------------------
async function aiGenerate(action, leadId, prompt, context) {
  const tk = await token();
  const r = await fetch(`${SB_URL}/functions/v1/ai-generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tk}`, apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({
      action, serviceSlug: CFG.SERVICE_SLUG, businessRef: leadId,
      requestRef: randomUUID(), lang: "pt", prompt, context,
    }),
    signal: AbortSignal.timeout(action === "generate_site" ? CFG.EDGE_TIMEOUT_MS : 60_000),
  }).catch(() => null);
  return r ? { status: r.status, data: await r.json().catch(() => ({})) } : { status: 0, data: {} };
}

function leadContext(f) {
  return {
    nome: f.title, categoria: "barbearia", endereco: f.address,
    cidade: f.cidade, uf: f.uf, telefone: f.phone, site: f.website,
    avaliacao: f.rating, totalAvaliacoes: f.ratingCount,
    mapsUrl: f.cid ? `https://maps.google.com/?cid=${f.cid}` : null,
  };
}

const SITE_PROMPT = `Crie o site institucional completo deste estabelecimento, pronto para publicar. Nome, categoria, endereço, telefone e avaliação estão no contexto — use-os de verdade.`;
const REPLY_PROMPT = `Escreva uma mensagem curta de primeira abordagem via WhatsApp oferecendo ${CFG.SERVICE_NAME} para este estabelecimento. O estabelecimento NÃO tem site — use isso como gancho principal. Tom humano, sem exageros, máximo 3 parágrafos curtos, terminando com uma pergunta simples. NÃO inclua links — o link do site vai numa mensagem separada.`;

async function phaseSites(state) {
  const pend = state.found.filter((f) => {
    const k = f.cid || f.phone || `${f.title}|${f.address}`;
    const l = state.leads[k];
    return l && l.etapa === "saved";
  });
  log(`gerando ${pend.length} sites (concorrência ${CFG.SITE_CONCURRENCY})…`);
  let i = 0, ok = 0, fail = 0;
  await Promise.all(Array.from({ length: CFG.SITE_CONCURRENCY }, async () => {
    while (i < pend.length) {
      const f = pend[i++];
      const k = f.cid || f.phone || `${f.title}|${f.address}`;
      const l = state.leads[k];
      const { status, data } = await aiGenerate("generate_site", l.leadId, SITE_PROMPT, leadContext(f));
      if (status === 200 && data.siteSlug) {
        l.siteUrl = `${APP_URL}${data.siteUrl ?? `/site/${data.siteSlug}`}`;
        l.etapa = "site"; ok++;
        // grava o output como o fluxo do app faz
        await fetch(`${SB_URL}/rest/v1/lead_outputs`, {
          method: "POST", headers: SH,
          body: JSON.stringify({ lead_id: l.leadId, user_id: CFG.USER_ID, tipo: "generate_site", conteudo: data.conteudo ?? l.siteUrl, modelo: data.modelo ?? null }),
        });
      } else {
        l.etapa = "failed"; l.erro = `site ${status}: ${(data.erro ?? data.error ?? "falha").slice(0, 120)}`; fail++;
      }
      if ((ok + fail) % 10 === 0) { saveState(state); log(`  sites: ${ok} ok / ${fail} falhas`); }
    }
  }));
  saveState(state);
  state.phase = "messages";
  log(`sites: ${ok} gerados, ${fail} falhas`);
}

async function phaseMessages(state) {
  const pend = state.found.filter((f) => {
    const k = f.cid || f.phone || `${f.title}|${f.address}`;
    const l = state.leads[k];
    return l && (l.etapa === "site" || l.etapa === "failed");
  });
  log(`gerando ${pend.length} mensagens de abordagem…`);
  let ok = 0, fail = 0;
  for (const f of pend) {
    const k = f.cid || f.phone || `${f.title}|${f.address}`;
    const l = state.leads[k];
    const { status, data } = await aiGenerate("sales_reply", l.leadId, REPLY_PROMPT, leadContext(f));
    if (status === 200 && typeof data.conteudo === "string" && data.conteudo.trim()) {
      l.msg = data.conteudo.trim();
      l.etapa = "queued";
      state.queue.push({ key: k, leadId: l.leadId });
      ok++;
      await fetch(`${SB_URL}/rest/v1/lead_outputs`, {
        method: "POST", headers: SH,
        body: JSON.stringify({ lead_id: l.leadId, user_id: CFG.USER_ID, tipo: "sales_reply", conteudo: l.msg, modelo: data.modelo ?? null }),
      });
    } else {
      l.etapa = "failed"; l.erro = `msg ${status}`; fail++;
    }
    if ((ok + fail) % 10 === 0) { saveState(state); log(`  msgs: ${ok} ok / ${fail} falhas`); }
    await sleep(jitter(400, 900));
  }
  saveState(state);
  state.phase = "send";
  log(`mensagens: ${ok} prontas, ${fail} falhas → ${state.queue.length} na fila de envio`);
}

// ----------------------------- Evolution -------------------------------
async function evoSend(number, text) {
  const r = await fetch(`${EVO_URL}/message/sendText/${CFG.INSTANCE}`, {
    method: "POST",
    headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number, text }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  return r?.ok ?? false;
}

async function phaseSend(state) {
  log(`fila de envio: ${state.queue.length} mensagens, 1 a cada ${CFG.SEND_MIN_MS / 60000}–${CFG.SEND_MAX_MS / 60000}min`);
  while (state.queue.length) {
    const item = state.queue[0];
    const l = state.leads[item.key];
    const digits = toE164(l?.telefone, "55");
    if (!digits) {
      state.queue.shift(); state.failed++;
      if (l) { l.etapa = "failed"; l.erro = "sem telefone válido"; }
      saveState(state); continue;
    }
    const text = l.siteUrl ? `${l.msg}\n\n${l.siteUrl}` : l.msg;
    const ok = await evoSend(digits, text);
    const now = new Date().toISOString();
    if (ok) {
      state.queue.shift(); state.sent++;
      l.etapa = "sent"; l.enviadoEm = now;
      // marca "contatado" + registra no lead (merge de dados — o edge
      // já escreveu siteSlug lá, não pode sobrescrever)
      const cur = await fetch(`${SB_URL}/rest/v1/leads?id=eq.${l.leadId}&select=dados`, { headers: SH })
        .then((r) => r.json()).catch(() => []);
      await fetch(`${SB_URL}/rest/v1/leads?id=eq.${l.leadId}`, {
        method: "PATCH", headers: SH,
        body: JSON.stringify({
          status: "contatado",
          dados: { ...(Array.isArray(cur) && cur[0]?.dados ? cur[0].dados : {}), pais: "BR", fonte: "prospect-bot", abordagemEm: now },
        }),
      });
      if (CFG.OWNER_COPY) {
        await evoSend(CFG.OWNER_NUMBER, `📤 [${state.sent}] Abordagem enviada → ${l.nome}\n${l.siteUrl ?? "(sem site)"}\n\n${l.msg}`);
      }
      log(`  enviada ${state.sent} → ${l.nome} (${digits})`);
    } else {
      // falha de envio — re-tenta depois de 2 rodadas no fim da fila
      item.retries = (item.retries ?? 0) + 1;
      if (item.retries >= 3) { state.queue.shift(); state.failed++; l.etapa = "failed"; l.erro = "envio falhou 3x"; }
      else state.queue.push(state.queue.shift());
      log(`  envio FALHOU → ${l?.nome} (retry ${item.retries})`);
    }
    saveState(state);
    const wait = jitter(CFG.SEND_MIN_MS, CFG.SEND_MAX_MS);
    log(`  próxima em ${Math.round(wait / 60000)}min (faltam ${state.queue.length})`);
    await sleep(wait);
  }
  state.phase = "done";
  saveState(state);
}

async function report(state) {
  const total = Object.keys(state.leads).length;
  const sites = Object.values(state.leads).filter((l) => l.siteUrl).length;
  await evoSend(CFG.OWNER_NUMBER,
    `✅ Prospecção concluída!\n\n` +
    `• ${total} leads salvos\n` +
    `• ${sites} sites gerados\n` +
    `• ${state.sent} abordagens enviadas\n` +
    `• ${state.failed} falhas\n\n` +
    `Os contatados estão marcados no CRM.`);
}

// ----------------------------- main ------------------------------------
const args = process.argv.slice(2);
if (args.includes("--limit")) {
  CFG.LIMIT = Number(args[args.indexOf("--limit") + 1]) || CFG.LIMIT;
}
const state = loadState();
if (args.includes("--reset")) {
  state.found = []; state.leads = {}; state.queue = [];
  state.sent = 0; state.failed = 0; state.phase = "search";
}
const searchOnly = args.includes("--search-only");
const sendOnly = args.includes("--send-only");

if (!SB_URL || !SB_SERVICE || !SB_ANON) die("Supabase env ausente no .env.local");
if (!SERPER) die("SERPER_API_KEY ausente");
if (!EVO_URL || !EVO_KEY) die("EVOLUTION_API_URL/KEY ausente");

// Só as fases de IA precisam de JWT de usuário; busca/salva/envio usam
// service key + Evolution direto.
const phasesNeedAuth = !searchOnly && !sendOnly;
if (phasesNeedAuth) await login();

if (!sendOnly) {
  if (state.phase === "search") await phaseSearch(state);
  if (state.phase === "enrich") await phaseEnrich(state);
  if (state.phase === "save") await phaseSave(state);
  if (!searchOnly) {
    if (state.phase === "sites") await phaseSites(state);
    if (state.phase === "messages") await phaseMessages(state);
  }
}
if (!searchOnly || sendOnly) {
  if (state.phase === "send" || sendOnly) await phaseSend(state);
  if (state.phase === "done") await report(state);
}
log(`fim — ${state.sent} enviadas, ${state.failed} falhas, fase "${state.phase}". Estado em scripts/prospect-state.json`);
