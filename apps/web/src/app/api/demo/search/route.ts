import { NextResponse, type NextRequest } from "next/server";
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { allowedOrigin } from "@/lib/auth/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabasePublicConfig } from "@/lib/auth/config";

// Demo da landing/explorar: busca REAL com contatos mascarados.
// 3 buscas por visitante (cookie HMAC), cache por query pra não chamar
// o provedor duas vezes e cap global diário de buscas frescas.
const MAX_BUSCAS = 3;
const FRESH_CAP_DIA = 60;
const COOKIE = "seeker_demo";
const SAMPLE_QUERY = "barbearia em São Paulo, SP";

const secret = () =>
  process.env.AUTH_RATE_LIMIT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const bodySchema = z.object({
  query: z.string().trim().min(2).max(200),
  regionCode: z.string().regex(/^[A-Za-z]{2}$/).default("BR"),
});

// Cookie "3.busca" assinado — evita reset por F5/devtools casual.
function readCount(req: NextRequest): number {
  const raw = req.cookies.get(COOKIE)?.value ?? "";
  const [n, sig] = raw.split(".");
  const num = Number(n);
  if (!Number.isInteger(num) || num < 0 || num > MAX_BUSCAS) return 0;
  const expect = createHmac("sha256", secret())
    .update(`seeker-demo:${num}`).digest("hex").slice(0, 16);
  return sig === expect ? num : 0;
}

function cookieHeader(n: number): string {
  const sig = createHmac("sha256", secret())
    .update(`seeker-demo:${n}`).digest("hex").slice(0, 16);
  return `${COOKIE}=${n}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`;
}

// Cap global de buscas FRESCAS por dia (cache não conta) — protege o
// custo do provedor mesmo se alguém limpar cookies.
async function freshCap(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const key = createHmac("sha256", secret())
    .update("auth:demo-search:fresh").digest("hex");
  const { data } = await admin.rpc("check_auth_rate_limit", {
    p_key: key, p_limit: FRESH_CAP_DIA, p_window_seconds: 86_400,
  });
  return Boolean(data?.[0]?.allowed);
}

// Cap por IP/dia — o cookie segura o visitante casual; este segura quem
// limpa cookie de propósito. Sem proxy confiável conta um bucket global.
async function ipCap(admin: ReturnType<typeof createSupabaseAdminClient>, headers: Headers) {
  const ip = process.env.TRUST_PROXY_HEADERS === "true"
    ? headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 64) || "unknown"
    : "shared";
  const key = createHmac("sha256", secret())
    .update(`auth:demo-search:ip:${ip}`).digest("hex");
  const { data } = await admin.rpc("check_auth_rate_limit", {
    p_key: key, p_limit: ip === "shared" ? 40 : 12, p_window_seconds: 86_400,
  });
  return data ? Boolean(data[0]?.allowed) : true; // rate limit indisponível não derruba a demo
}

interface RawPlace {
  nome: string | null; cidade: string | null; bairro: string | null; uf: string | null;
  categoria: string | null; avaliacao: number | null; totalAvaliacoes: number | null;
  site: string | null; telefone: string | null; whatsapp: boolean | null;
  instagram: string | null; siteCheck?: { estado?: string } | null;
}

// Nome, bairro e avaliação ficam de verdade (prova social). Tudo que é
// contato sai mascarado — o visitante vê que existe, não o valor.
function sanitize(p: RawPlace) {
  const digits = (p.telefone ?? "").replace(/\D/g, "");
  const ig = (p.instagram ?? "").replace(/^@/, "");
  const estado = p.siteCheck?.estado ?? null;
  const score = Math.min(99, Math.max(40, Math.round(
    35 + (p.whatsapp || p.telefone ? 18 : 0) +
    (!p.site ? 28 : estado === "fora" ? 24 : estado === "desatualizado" ? 18 : estado === "ok" ? 8 : 0) +
    Math.min(15, (p.avaliacao ?? 0) * 3) + Math.min(8, (p.totalAvaliacoes ?? 0) / 40),
  )));
  return {
    nome: p.nome, cidade: p.cidade, bairro: p.bairro, uf: p.uf,
    categoria: p.categoria, avaliacao: p.avaliacao, totalAvaliacoes: p.totalAvaliacoes,
    semSite: !p.site, siteEstado: estado,
    whatsapp: Boolean(p.whatsapp || p.telefone)
      ? (digits.length >= 8 ? `${digits.slice(0, 4)} ••••-••••` : "••••-••••") : null,
    instagram: ig ? `@${ig.slice(0, 1)}••••` : null,
    score,
  };
}

async function runEdge(query: string, regionCode: string) {
  const config = supabasePublicConfig();
  if (!config) return null;
  // Mesmo token que a edge confere: sha256("seeker-demo:"+KEY)[:32].
  // Na edge, SUPABASE_SERVICE_ROLE_KEY injetada carrega o valor novo
  // (sb_secret_*) — que aqui vive em SUPABASE_SECRET_KEY.
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const demoKey = createHash("sha256")
    .update(`seeker-demo:${key}`)
    .digest("hex").slice(0, 32);
  const res = await fetch(`${config.url}/functions/v1/places-search`, {
    method: "POST",
    headers: {
      apikey: config.key, "Content-Type": "application/json",
      // O gateway exige um JWT válido (a anon key é um) — a demo em si
      // é autorizada pelo x-seeker-demo, conferido dentro da função.
      Authorization: `Bearer ${config.key}`,
      "x-seeker-demo": demoKey,
    },
    body: JSON.stringify({ query, regionCode }),
    signal: AbortSignal.timeout(150_000),
  });
  const data = await res.json().catch(() => null) as
    { resultados?: RawPlace[]; provedor?: string; erro?: string } | null;
  if (!res.ok || !data?.resultados) return null;
  return { resultados: data.resultados, provedor: String(data.provedor ?? "") };
}

async function cachedOrFresh(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  query: string, regionCode: string,
) {
  const { data: hit } = await admin.from("demo_searches")
    .select("results").eq("query_norm", query.toLowerCase().trim()).maybeSingle();
  if (hit?.results) return { resultados: hit.results as RawPlace[], cached: true };
  if (!(await freshCap(admin))) return null;
  const fresh = await runEdge(query, regionCode);
  if (!fresh) return null;
  await admin.from("demo_searches").upsert({
    query, results: fresh.resultados, provedor: fresh.provedor || "google_places",
  }, { onConflict: "query_norm" }).then(() => {}, () => {});
  return { resultados: fresh.resultados, cached: false };
}

async function randomSite(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data } = await admin.from("sites")
    .select("slug,nome").eq("publicado", true).limit(40);
  const list = data ?? [];
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

async function respond(leads: RawPlace[], restante: number, site: unknown, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { leads: leads.map(sanitize), site, restante, ...extra },
    { headers: { "Set-Cookie": cookieHeader(MAX_BUSCAS - restante), "Cache-Control": "no-store" } },
  );
}

// GET = amostra grátis (não consome cota): a primeira dobra da landing
// já abre mostrando resultados reais.
export async function GET(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const sample = await cachedOrFresh(admin, SAMPLE_QUERY, "BR").catch(() => null);
  const site = await randomSite(admin).catch(() => null);
  if (!sample) return NextResponse.json({ error: "Indisponível." }, { status: 503 });
  return respond(sample.resultados.slice(0, 9), MAX_BUSCAS - readCount(request), site);
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise os campos." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const usado = readCount(request);
  if (usado >= MAX_BUSCAS || !(await ipCap(admin, request.headers))) {
    return NextResponse.json({ limit: true, restante: 0 }, { status: 403 });
  }
  const found = await cachedOrFresh(admin, parsed.data.query, parsed.data.regionCode.toUpperCase())
    .catch(() => null);
  const site = await randomSite(admin).catch(() => null);
  if (!found) {
    return NextResponse.json({ error: "Busca indisponível agora. Tente mais tarde." }, { status: 503 });
  }
  const restante = MAX_BUSCAS - usado - 1;
  return respond(found.resultados.slice(0, 9), restante, site);
}
