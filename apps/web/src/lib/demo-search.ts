import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaceResult } from "./app-client";

// Busca-demo da primeira pesquisa: quem entra sem plano recebe ~20
// estabelecimentos REAIS já salvos no banco (lead de buscas anteriores),
// sorteados por usuário — zero chamada Serper/ScrapeCreators. Cobra o
// custo normal de busca (credit_action_rules) e os leads podem ser
// salvos/usados normalmente. Se o banco não tiver leads suficientes,
// retorna null e o fluxo real (gen/edge) assume.

const DEMO_TARGET = 20;
const DEMO_MIN = 15;
const DEMO_POOL = 2000;

export interface LeadPoolRow {
  place_id: string | null;
  nome: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  site: string | null;
  avaliacao: number | null;
  total_avaliacoes: number | null;
  categoria: string | null;
  maps_url: string | null;
  imagem: string | null;
  lat: number | null;
  lng: number | null;
  whatsapp: string | null;
  instagram: string | null;
  dados: Record<string, unknown> | null;
}

// PRNG determinístico por usuário — cada conta vê uma mistura diferente.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Relevância da vitrine-demo: a query vem como "<nicho> em <cidade>[, refino]"
// (pt) ou "<niche> in <city>" (demais idiomas). Normaliza sem acento e
// premia leads cuja cidade/nicho batem com o que o usuário pediu —
// sem filtro rígido, pra sempre completar 20 resultados.
export function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

export function queryNormOf(query: string): string {
  // Só o trecho antes da vírgula (refino livre do usuário não é cidade).
  return ` ${norm(query.split(",")[0])} `;
}

export function cidadeMatch(l: LeadPoolRow, q: string): boolean {
  const c = norm(l.cidade);
  return c.length >= 3 && q.includes(` ${c} `);
}

// Preposições de lugar nos 6 idiomas — o nicho é o que vem antes delas
// ("dentistas em São Paulo", "plumbers in Austin", "idraulici a Roma").
const PLACE_PREPS = new Set(["em", "in", "en", "à", "a", "dans", "di"]);

export function nichoMatch(l: LeadPoolRow, query: string): boolean {
  const cat = norm(l.categoria);
  if (!cat) return false;
  const tokens = norm(query.split(",")[0]).split(" ").filter(Boolean);
  const prepIdx = tokens.findIndex((w) => PLACE_PREPS.has(w));
  const head = (prepIdx > 0 ? tokens.slice(0, prepIdx) : tokens.slice(0, 2)).join(" ");
  if (!head) return false;
  // Radical simples: "dentista" casa "dentistas" e vice-versa.
  const stem = (w: string) => w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w;
  const catWords = cat.split(" ").map(stem);
  return head.split(" ").some((w) => w.length > 3 && catWords.some((c) => c.startsWith(stem(w)) || stem(w).startsWith(c)));
}

function tierOf(p: { instagram: string | null; site: string | null; siteCheck?: { estado: string } | null }): number {
  const ig = Boolean(p.instagram);
  const site = Boolean(p.site);
  if (ig && !site) return 0;
  if (ig && site) return p.siteCheck?.estado === "bom" ? 3 : 1;
  if (!ig && !site) return 2;
  return 3;
}

function prioridadeOf(tier: number): "alta" | "media" | "baixa" {
  return tier === 0 ? "alta" : tier === 1 ? "media" : "baixa";
}

function scoreOf(p: LeadPoolRow & { ig?: unknown }): number {
  const siteCheck = (p.dados?.siteCheck ?? null) as { estado?: string } | null;
  return (p.telefone ? 4 : 0) + (p.whatsapp === "sim" ? 2 : 0) +
    (p.instagram ? 1.5 : 0) + (p.avaliacao ?? 0) / 10 +
    (!p.site ? 3 : siteCheck?.estado === "fora" ? 2.5
      : siteCheck?.estado === "desatualizado" ? 2 : 0);
}

export function toPlace(l: LeadPoolRow): PlaceResult {
  const dados = l.dados ?? {};
  const siteCheck = (dados.siteCheck ?? null) as PlaceResult["siteCheck"];
  const ig = (dados.ig ?? null) as PlaceResult["ig"];
  const horariosLabel = (dados.horariosLabel ?? null) as PlaceResult["horariosLabel"];
  const base = {
    id: l.place_id,
    nome: l.nome,
    endereco: l.endereco,
    bairro: l.bairro,
    cidade: l.cidade,
    uf: l.uf,
    telefone: l.telefone,
    site: l.site,
    avaliacao: l.avaliacao,
    totalAvaliacoes: l.total_avaliacoes,
    categoria: l.categoria,
    status: null,
    mapsUrl: l.maps_url,
    imagem: l.imagem,
    lat: l.lat,
    lng: l.lng,
    pais: (dados.pais as string | null | undefined) ?? null,
    whatsapp: l.whatsapp === "sim" ? true : l.whatsapp === "nao" ? false : null,
    instagram: l.instagram,
    ig,
    horariosLabel,
    siteCheck,
    leadId: null,
    sitePronto: false,
  };
  return { ...base, prioridade: prioridadeOf(tierOf(base)) };
}

export type DemoSearchResult =
  | { kind: "job"; jobId: string }
  | { kind: "credits" }
  | { kind: "skip" };

// Devolve o job já concluído quando a busca-demo é servida; "credits"
// quando a reserva falhou por saldo; "skip" cai no fluxo real.
export async function demoFirstSearch(
  admin: SupabaseClient,
  userId: string,
  payload: { query: string; serviceSlug: string; requestRef: string; regionCode: string },
): Promise<DemoSearchResult> {
  // Só a PRIMEIRA busca de quem nunca assinou — assinante e quem já
  // buscou (job que não falhou) caem direto no provedor real. Job com
  // erro é estornado e não conta: a próxima tentativa ainda é demo.
  const [{ count: priorJobs }, { data: sub }] = await Promise.all([
    admin.from("search_jobs").select("id", { count: "exact", head: true })
      .eq("user_id", userId).neq("status", "error"),
    admin.from("subscriptions").select("id").eq("user_id", userId).eq("status", "active").limit(1),
  ]);
  if ((priorJobs ?? 0) > 0 || (sub ?? []).length > 0) return { kind: "skip" };

  const { data: rows, error } = await admin.from("leads")
    .select("place_id,nome,endereco,bairro,cidade,uf,telefone,site,avaliacao,total_avaliacoes,categoria,maps_url,imagem,lat,lng,whatsapp,instagram,dados")
    .not("place_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(DEMO_POOL);
  if (error || !rows?.length) return { kind: "skip" };

  // Dedup por place_id (o mesmo lugar pode ter sido salvo por usuários
  // diferentes) e diversificação: no máximo 2 por categoria pra não
  // encher a vitrine de um nicho só.
  const seen = new Set<string>();
  const pool: LeadPoolRow[] = [];
  for (const l of rows as LeadPoolRow[]) {
    const key = (l.place_id ?? "").toLowerCase();
    if (!key || seen.has(key) || !l.nome) continue;
    seen.add(key);
    pool.push(l);
  }
  const rand = mulberry32(seedOf(userId));
  const q = queryNormOf(payload.query);
  // Score + jitter determinístico por usuário: qualidade alta primeiro,
  // cidade e nicho pedidos pesam mais, mas cada conta vê uma mistura
  // diferente (não a mesma lista pra todos).
  const ranked = pool
    .map((l) => ({
      l,
      s: scoreOf(l) + (rand() - 0.5) * 6
        + (cidadeMatch(l, q) ? 10 : 0) + (nichoMatch(l, payload.query) ? 4 : 0),
    }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.l);

  const perCat = new Map<string, number>();
  const picked: LeadPoolRow[] = [];
  for (const l of ranked) {
    if (picked.length >= DEMO_TARGET) break;
    const cat = (l.categoria ?? "outros").toLowerCase().slice(0, 40);
    const n = perCat.get(cat) ?? 0;
    if (n >= 2) continue;
    perCat.set(cat, n + 1);
    picked.push(l);
  }
  // Se a trava por categoria deixou faltar, completa sem ela.
  if (picked.length < DEMO_TARGET) {
    for (const l of ranked) {
      if (picked.length >= DEMO_TARGET) break;
      if (!picked.includes(l)) picked.push(l);
    }
  }
  if (picked.length < DEMO_MIN) return { kind: "skip" };

  const resultados = picked.map(toPlace);

  // Cobra o custo normal de busca — mesma reserva/settle da edge,
  // idempotente por requestRef.
  const inputHash = createHash("sha256")
    .update(JSON.stringify({ query: payload.query, regionCode: payload.regionCode, service: payload.serviceSlug, provider: "demo-cache" }))
    .digest("hex");
  const { data: op, error: reserveErr } = await admin.rpc("reserve_credit_action", {
    p_user: userId,
    p_action: "search",
    p_business_ref: null,
    p_service: payload.serviceSlug,
    p_input_hash: inputHash,
    p_request_ref: payload.requestRef,
  });
  if (reserveErr) {
    if (/saldo|insufficient|Wallet/i.test(reserveErr.message ?? "")) return { kind: "credits" };
    return { kind: "skip" };
  }
  const cost = (op as { cost?: number } | null)?.cost ?? 0;
  await admin.rpc("settle_credit_action", {
    p_user: userId,
    p_request_ref: payload.requestRef,
    p_outcome: "completed",
  });

  const { data: job, error: jobErr } = await admin.from("search_jobs")
    .insert({
      user_id: userId,
      payload,
      status: "done",
      result: {
        resultados,
        provedor: "cache",
        replay: true,
        creditosCobrados: cost,
      },
      progresso: 100,
      etapa: "Concluída",
    })
    .select("id").single();
  if (jobErr || !job) {
    // Job não gravou: estorna a reserva pra não cobrar por nada.
    await admin.rpc("settle_credit_action", {
      p_user: userId,
      p_request_ref: payload.requestRef,
      p_outcome: "refunded",
    });
    return { kind: "skip" };
  }
  return { kind: "job", jobId: job.id };
}
