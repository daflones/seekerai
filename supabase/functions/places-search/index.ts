// Busca de estabelecimentos — provedor único: Serper (/maps, keys 5–7).
// Instagram enriquecido via ScrapeCreators + cache (sem Apify).
// Consome créditos (ação 'search'). Chaves ficam como secrets do Supabase.

import {
  asString,
  fail,
  httpError,
  isRecord,
  json,
  readJson,
  requirePost,
  requireUser,
  reserveAction,
  serviceClient,
  settleAction,
  sha256Hex,
} from "../_shared/common.ts";
import { getSecret, getSetting, requireSecret } from "../_shared/secrets.ts";
import { igProfileCached } from "../_shared/instagram.ts";
import { notifyError, NotifyErrorInput } from "../_shared/notify.ts";
import { callingCodeFor, toE164 } from "../_shared/phone.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SearchBody {
  query?: string;
  serviceSlug?: string;
  requestRef?: string;
  regionCode?: string;
}

interface NormalizedPlace {
  id: string | null;
  nome: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  site: string | null;
  avaliacao: number | null;
  totalAvaliacoes: number | null;
  status: string | null;
  categoria: string | null;
  mapsUrl: string | null;
  imagem: string | null;
  pais: string | null;
  lat: number | null;
  lng: number | null;
  whatsapp: boolean | null;
  instagram: string | null;
  /** Horários reais do Maps — "Segunda: 09:00–19:00" pares [dia, faixa]. */
  horariosLabel?: [string, string][] | null;
  /** Dados do perfil do Instagram — preenchido pelo enrichInstagram. */
  ig?: IgProfile | null;
  siteCheck?: SiteCheck | null;
  /** Lead já salvo desse lugar (match por place_id) — vira "Ver lead". */
  leadId?: string | null;
  /** Lead salvo já tem site gerado — badge no card. */
  sitePronto?: boolean;
}

interface IgProfile {
  seguidores: number | null;
  posts: number | null;
  /** Média de curtidas dos últimos posts (engajamento do perfil). */
  curtidas: number | null;
  foto: string | null;
  bio: string | null;
  verificado: boolean;
}

interface SiteCheck {
  estado: "bom" | "ok" | "desatualizado" | "fora";
  sinais: string[];
}

/**
 * Serper.dev /maps — raspador de Google Maps barato (~$1/1k buscas).
 * Devolve dados que nem o Places New traz: horários em pt-BR,
 * thumbnail e category em português. Terceira fonte da cadeia.
 */
async function searchSerper(query: string, regionCode: string, pages = 1): Promise<NormalizedPlace[]> {
  // Só as chaves com crédito — _1.._4 estão sem saldo no Serper.
  const keys = [
    await getSecret("SERPER_API_KEY_5"),
    await getSecret("SERPER_API_KEY_6"),
    await getSecret("SERPER_API_KEY_7"),
  ].filter((k): k is string => Boolean(k));
  if (!keys.length) throw httpError(502, "Serper não configurado");
  // Key que falhou uma vez não vale retentar a cada página — com
  // paginação paralela cada tentativa custava até 30s de espera morta.
  const deadKeys = new Set<string>();
  const fetchPage = async (page: number, ll: string | null) => {
    for (const key of keys.filter((k) => !deadKeys.has(k))) {
      const res = await fetch("https://google.serper.dev/maps", {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query,
          gl: regionCode.toLowerCase(),
          hl: "pt-br",
          num: 20,
          // Paginação do maps exige o "ll" (GPS) devolvido na pág. 1.
          ...(page > 1 ? { page, ll } : {}),
        }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      if (res?.ok) return await res.json().catch(() => null);
      deadKeys.add(key);
    }
    return null;
  };
  const first = await fetchPage(1, null);
  if (!first) throw httpError(502, "Serper indisponível no momento");
  const pages_ = [first];
  const ll = asString(first.ll, 100);
  // Páginas extras (planos maiores) saem em paralelo — ~$0.002 cada.
  if (pages > 1 && ll) {
    pages_.push(...await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => fetchPage(i + 2, ll)),
    ));
  }
  const places = pages_.flatMap((data) =>
    isRecord(data) && Array.isArray(data.places) ? data.places : []);
  if (!places.length) throw httpError(502, "Serper não retornou resultados");

  // "Av. X, 1310 - Bairro, Cidade - UF, CEP, Brasil" → partes.
  const parseAddress = (address: string | null) => {
    const parts = (address ?? "").split(", ");
    const ufIdx = parts.findIndex((s) => / - [A-Za-z]{2}$/.test(s.trim()));
    const ufPart = ufIdx >= 0 ? parts[ufIdx].split(" - ") : null;
    const ruaBairro = parts[0]?.split(" - ");
    return {
      bairro: ruaBairro && ruaBairro.length > 1 ? asString(ruaBairro[ruaBairro.length - 1], 150) : null,
      cidade: ufPart ? asString(ufPart[0], 150) : null,
      uf: ufPart ? asString(ufPart[1], 50)?.toUpperCase() ?? null : null,
    };
  };

  const DAY_ORDER = [
    "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
    "sexta-feira", "sábado", "domingo",
  ];

  return places.filter(isRecord).map((p) => {
    const addr = parseAddress(asString(p.address, 500));
    const oh = isRecord(p.openingHours) ? p.openingHours : null;
    const horariosLabel = oh
      ? DAY_ORDER.flatMap((d): [string, string][] => {
        const h = asString(oh[d], 120);
        return h ? [[d[0].toUpperCase() + d.slice(1), h]] : [];
      })
      : [];
    const cid = asString(p.cid, 200);
    return {
      id: asString(p.placeId ?? p.cid ?? p.fid, 300),
      nome: asString(p.title),
      endereco: asString(p.address, 500),
      bairro: addr.bairro,
      cidade: addr.cidade,
      uf: addr.uf,
      pais: regionCode.toUpperCase(),
      telefone: asString(p.phoneNumber),
      site: asString(p.website, 500),
      avaliacao: typeof p.rating === "number" ? p.rating : null,
      totalAvaliacoes: typeof p.ratingCount === "number" ? p.ratingCount : null,
      status: "OPERATIONAL",
      categoria: asString(p.type, 150),
      mapsUrl: cid ? `https://www.google.com/maps?cid=${cid}` : null,
      imagem: asString(p.thumbnailUrl, 1200),
      lat: typeof p.latitude === "number" ? p.latitude : null,
      lng: typeof p.longitude === "number" ? p.longitude : null,
      whatsapp: null,
      instagram: null,
      horariosLabel: horariosLabel.length ? horariosLabel : null,
    };
  });
}

/** Instagram vira campo próprio; perfil de Instagram não conta como site. */
function extractInstagram(place: NormalizedPlace): void {
  const existing = place.instagram;
  if (existing) {
    const match = existing.match(/instagram\.com\/([A-Za-z0-9._%]+)/i);
    const handle = match ? match[1] : existing.replace(/^@/, "").replace(/\/+$/, "");
    if (/^[A-Za-z0-9._%]{1,60}$/.test(handle)) place.instagram = `@${handle}`;
  }
  if (place.site && /instagram\.com\//i.test(place.site)) {
    const match = place.site.match(/instagram\.com\/(?:p\/)?([A-Za-z0-9._%]+)/i);
    if (match && !["explore", "reel", "reels", "stories", "p", "tv"]
      .includes(match[1].toLowerCase())) {
      if (!place.instagram) place.instagram = `@${match[1]}`;
    }
    place.site = null;
  }
}

/**
 * Enriquecimento Instagram: depois que o Maps revela o @, o perfil
 * (seguidores/posts/foto/bio) vem do cache (7d) + ScrapeCreators.
 * Cap por plano (8 base, até 16) e corrido com timeout — nunca
 * derruba a busca.
 */
async function enrichInstagram(places: NormalizedPlace[], cap = 8): Promise<void> {
  const comIg = places.filter((p) => p.instagram).slice(0, cap);
  if (!comIg.length) return;

  const applyProfile = (p: NormalizedPlace, prof: {
    seguidores: number | null; posts: number | null; curtidas: number | null;
    foto: string | null; bio: string | null; verificado: boolean; whatsapp?: string | null;
  }) => {
    p.ig = {
      seguidores: prof.seguidores, posts: prof.posts, curtidas: prof.curtidas,
      foto: prof.foto, bio: prof.bio, verificado: prof.verificado,
    };
    // wa.me na bio = telefone real — preenche quando o Maps não trouxe.
    if (prof.whatsapp && !p.telefone) {
      p.telefone = `+${prof.whatsapp}`;
      p.whatsapp = true;
    }
  };

  // Fonte única: cache (7d) + ScrapeCreators — barato, por handle.
  await Promise.all(comIg.map(async (p) => {
    try {
      const prof = await igProfileCached(p.instagram!.replace(/^@/, ""));
      if (prof) applyProfile(p, prof);
    } catch { /* sem perfil — segue sem dados de IG */ }
  }));
}

/** Extrai o @ do Instagram dos links do HTML (grátis — já baixado no scan). */
function instagramFromHtml(html: string): string | null {
  const match = html.match(
    /instagram\.com\/(?!p\/|reel|explore|stories|tv)([A-Za-z0-9._]{2,40})/i,
  );
  if (!match) return null;
  const handle = match[1].replace(/\.+$/, "");
  return /^[A-Za-z0-9._]{2,40}$/.test(handle) ? `@${handle}` : null;
}

/** Acessa o site do estabelecimento e extrai sinais de qualidade/atualização. */
async function scanWebsite(site: string): Promise<SiteCheck & { instagram?: string | null }> {
  const url = site.startsWith("http") ? site : `https://${site}`;
  let html = "";
  let finalUrl = url;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "SeekerAiBot/1.0 (+https://seekerai.digital)" },
      signal: AbortSignal.timeout(8_000),
    });
    finalUrl = res.url;
    if (res.status >= 400) {
      return { estado: "fora", sinais: [`respondeu erro ${res.status}`] };
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) {
      return { estado: "ok", sinais: ["responde, mas não é uma página comum"] };
    }
    const reader = res.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < 180_000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.length;
      }
      reader.cancel().catch(() => {});
      html = new TextDecoder().decode(
        chunks.reduce((acc, c) => {
          const next = new Uint8Array(acc.length + c.length);
          next.set(acc); next.set(c, acc.length);
          return next;
        }, new Uint8Array(0)),
      );
    }
  } catch {
    return { estado: "fora", sinais: ["não respondeu — fora do ar ou bloqueou"] };
  }

  const sinais: string[] = [];
  let penal = 0;
  const lower = html.toLowerCase();

  if (!finalUrl.startsWith("https://")) {
    penal += 2;
    sinais.push("sem cadeado de segurança (HTTP)");
  }
  if (!lower.includes('name="viewport"') && !lower.includes("name='viewport'")) {
    penal += 2;
    sinais.push("não é adaptado para celular");
  }
  if (!/<title[^>]*>[^<]{3,}<\/title>/i.test(html)) {
    penal += 1;
    sinais.push("sem título configurado");
  }
  const years = [...lower.matchAll(/(?:©|&copy;|copyright)\s*(?:\(c\)\s*)?(20\d{2})/g)]
    .map((m) => Number(m[1]));
  const currentYear = new Date().getFullYear();
  const lastYear = years.length ? Math.max(...years) : null;
  if (lastYear !== null && currentYear - lastYear >= 2) {
    penal += 2;
    sinais.push(`parado desde ${lastYear}`);
  }
  const generator = lower.match(/name=["']generator["'][^>]*content=["']([^"']+)/i)?.[1] ?? "";
  if (/wordpress/i.test(generator)) sinais.push("feito em WordPress");
  if (/(?:wix|weebly|sitebuilder)/i.test(generator)) {
    penal += 1;
    sinais.push("feito em construtor gratuito");
  }
  if (/facebook\.com|instagram\.com/.test(lower) === false && sinais.length === 0) {
    sinais.push("sem links de redes sociais");
  }

  const estado: SiteCheck["estado"] = penal >= 4
    ? "desatualizado"
    : penal >= 2
    ? "ok"
    : "bom";
  if (sinais.length === 0) sinais.push("site moderno e bem mantido");
  return { estado, sinais, instagram: instagramFromHtml(html) };
}

/** Varre os sites em lotes para não estourar o tempo da function. */
async function scanWebsites(places: NormalizedPlace[]): Promise<void> {
  // Buscas grandes (plano King, até 60) capam a varredura — os demais
  // ficam sem siteCheck e ainda pontuam como "com site" neutro.
  const comSite = places.filter((p) => p.site).slice(0, 30);
  // Lote maior: a varredura é I/O-bound e dominava o tempo total da busca
  // (5 rodadas × até 8s). Com 12 são ~3 rodadas no pior caso.
  const batch = 12;
  for (let i = 0; i < comSite.length; i += batch) {
    await Promise.all(
      comSite.slice(i, i + batch).map(async (p) => {
        try {
          const { instagram, ...check } = await scanWebsite(p.site!);
          p.siteCheck = check;
          // O @ descoberto no site alimenta o scrape de perfil adiante.
          if (instagram && !p.instagram) p.instagram = instagram;
        } catch {
          p.siteCheck = null;
        }
      }),
    );
  }
}

/** Verifica em lote quais números têm WhatsApp via Evolution API (grátis). */
async function checkWhatsapps(places: NormalizedPlace[], regionCode: string): Promise<void> {
  // Código de discagem por estabelecimento (país detectado) — busca em
  // qualquer país verifica o número certo, não só o da região do usuário.
  const ccFor = (p: NormalizedPlace) => callingCodeFor(p.pais ?? regionCode);
  const numbers = places
    .map((p) => toE164(p.telefone, ccFor(p)))
    .filter((d): d is string => d !== null);
  if (numbers.length === 0) return;
  try {
    const base = (await requireSecret("EVOLUTION_API_URL")).replace(/\/+$/, "");
    const instance = await requireSecret("EVOLUTION_INSTANCE");
    const res = await fetch(`${base}/chat/whatsappNumbers/${instance}`, {
      method: "POST",
      headers: {
        apikey: await requireSecret("EVOLUTION_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ numbers }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      console.error("[whatsapp-batch] evolution respondeu", res.status);
      return;
    }
    const data = (await res.json().catch(() => [])) as unknown;
    const exists = new Map<string, boolean>();
    if (Array.isArray(data)) {
      for (const entry of data) {
        if (!isRecord(entry)) continue;
        const raw = asString(entry.number) ?? asString(entry.jid)?.split("@")[0] ?? null;
        if (raw) exists.set(raw.replace(/\D/g, ""), entry.exists === true);
      }
    }
    for (const place of places) {
      const phone = toE164(place.telefone, ccFor(place));
      place.whatsapp = phone ? exists.get(phone) ?? null : null;
    }
  } catch (err) {
    // Evolution indisponível não derruba a busca — whatsapp fica nulo.
    console.error("[whatsapp-batch] falhou:", err instanceof Error ? err.message : err);
  }
}

Deno.serve(async (req) => {
  const notifyCtx: NotifyErrorInput = { onde: "places-search", erro: "" };
  try {
    requirePost(req);
    // Modo demo (landing/explorar): header interno derivado do service
    // key — sem usuário, sem cobrança, resultados limitados e sem
    // enriquecimento pesado. A rota /api/demo/search sanitiza a saída.
    const isDemo = req.headers.get("x-seeker-demo") ===
      (await sha256Hex(`seeker-demo:${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`))
        .slice(0, 32);
    const user = isDemo
      ? { id: "demo", email: null }
      : await requireUser(req);
    notifyCtx.usuario = { id: user.id, email: asString((user as Record<string, unknown>).email) };
    const body = await readJson<SearchBody>(req);

    const query = asString(body.query, 300)?.trim();
    const service = asString(body.serviceSlug, 60);
    const requestRef = asString(body.requestRef, 150);
    const jobId = asString(body.jobId, 40);
    const regionCode = (asString(body.regionCode, 2) ?? "BR").toUpperCase();
    if (!query || (!isDemo && (!service || !requestRef))) {
      throw httpError(400, "Informe query, serviceSlug e requestRef");
    }
    notifyCtx.contexto = `busca "${query}" · serviço ${service} · região ${regionCode}`;

    const db = serviceClient();
    // Progresso vivo pro painel admin — best-effort, nunca quebra a busca.
    // Também grava no feed `eventos` (mesmo RPC do gen-service) pro radar
    // mostrar as etapas ao vivo quando quem atende é a edge (fallback).
    const progress = async (p: number, etapa: string) => {
      if (!jobId) return;
      await db.rpc("report_job_event", {
        p_table: "search_jobs", p_id: jobId,
        p_pct: p, p_etapa: etapa,
      }).then(() => {}, () => {});
      await db.from("search_jobs")
        .update({ progresso: p, etapa, updated_at: new Date().toISOString() })
        .eq("id", jobId).eq("status", "running")
        .then(() => {}, () => {});
    };
    const [{ data: profile }, { data: sub }, replay] = await Promise.all([
      isDemo
        ? Promise.resolve({ data: null })
        : db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      isDemo
        ? Promise.resolve({ data: null })
        : db.from("subscriptions").select("plans(slug)").eq("user_id", user.id)
          .eq("status", "active").limit(1).maybeSingle(),
      getSetting("search_replay", "off"),
    ]);
    // Provedor único: Serper — o inputHash precisa bater com o do
    // gen-service ("serper") senão a reserva por requestRef dá conflito
    // de idempotência quando o fallback roda depois de um 5xx do gen.
    const provider = "serper";
    const isAdmin = profile?.role === "admin";
    const planSlug = (sub?.plans as { slug?: unknown } | null)?.slug;
    // Profundidade da busca por plano: provedores devolvem ~20 por
    // página — planos maiores paginam pra encher a lista de leads.
    const planTarget = isDemo ? 15
      : isAdmin || planSlug === "king" ? 60
      : planSlug === "pro" ? 40 : 20;
    const providerPages = Math.max(1, Math.ceil(planTarget / 20));

    // Replay de demonstração: somente para admin, sem chamar API nem cobrar.
    if (replay === "on" && isAdmin) {
      const { data: runs } = await db
        .from("search_runs")
        .select("id, query, provider, results, created_at")
        .order("created_at", { ascending: false })
        .limit(25);
      const list = runs ?? [];
      const match = list.find((r) => r.query.toLowerCase().trim() === query.toLowerCase())
        ?? list[0];
      if (!match) {
        throw httpError(404,
          "Replay ativo, mas nenhuma busca foi salva ainda. Desative o replay ou rode uma busca real.");
      }
      return json({
        resultados: match.results,
        provedor: match.provider,
        replay: true,
        runOriginal: match.query,
        creditosCobrados: 0,
      });
    }

    const inputHash = await sha256Hex(
      JSON.stringify({ query, regionCode, service, provider }),
    );
    const reservation = isDemo ? { cost: 0 } : await reserveAction(db, {
      userId: user.id,
      action: "search",
      businessRef: null,
      service,
      inputHash,
      requestRef,
    });

    try {
      // Provedor único: Serper (Google Maps). Sem fallback Apify/Google
      // Places — chaves mortas só atrasavam a falha real.
      const providers: [string, () => Promise<NormalizedPlace[]>][] = [
        ["serper", () => searchSerper(query, regionCode, providerPages)],
      ];

      await progress(12, "Consultando provedores de mapa");
      let resultados: NormalizedPlace[] | null = null;
      let provedor = provider;
      let lastErr: unknown = null;
      for (const [name, run] of providers) {
        try {
          resultados = await run();
          provedor = name;
          break;
        } catch (err) {
          lastErr = err;
          console.error(
            `[places-search] ${name} falhou, tentando próximo:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
      if (!resultados) {
        // O motivo real fica no console.error acima — pro cliente vai
        // sempre a mensagem genérica, sem nome de provedor.
        console.error("[places-search] todos os provedores falharam:", lastErr);
        throw httpError(502, "Busca indisponível no momento. Tente novamente em instantes.");
      }

      // Paginação pode repetir o mesmo lugar (id ou nome+endereço).
      {
        const seen = new Set<string>();
        resultados = resultados.filter((p) => {
          const k = (p.id ?? `${p.nome}|${p.endereco}`).toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }

      // Enriquecimento: WhatsApp em lote (grátis) + varredura dos sites
      // (que também descobre o @ do Instagram no HTML) — depois o scrape
      // batelado dos perfis (seguidores, curtidas, foto) com cap curto pra
      // não deixar a busca refém do actor de IG.
      await progress(38, `${resultados.length} estabelecimentos encontrados`);
      // Demo: corta cedo — enriquecer ~15 é rápido; contatos saem
      // mascarados na rota, então o enriquecimento de IG não roda.
      if (isDemo) resultados = resultados.slice(0, 15);
      for (const place of resultados) extractInstagram(place);
      const igCap = Math.min(16, Math.max(8, Math.ceil(planTarget / 4)));
      // Handles já conhecidos (Serper/Maps/site=instagram.com) enriquecem
      // EM PARALELO com a varredura de sites — antes o IG só começava
      // depois de tudo e somava até ~55s na cauda da busca. Os @ que a
      // varredura descobrir no HTML entram num segundo passe curto.
      const earlyIg = resultados.filter((p) => p.instagram).slice(0, igCap);
      const earlyHandles = new Set(earlyIg.map((p) => p.instagram!.toLowerCase()));
      const igEarly = isDemo || !earlyIg.length ? null
        : Promise.race([enrichInstagram(earlyIg, igCap), sleep(40_000)]);
      await Promise.all([
        checkWhatsapps(resultados, regionCode),
        scanWebsites(resultados),
      ]);
      await progress(62, "Verificando WhatsApp e sites");
      if (!isDemo) {
        await igEarly;
        const late = resultados
          .filter((p) => p.instagram && !earlyHandles.has(p.instagram.toLowerCase()))
          .slice(0, igCap);
        if (late.length) {
          await Promise.race([enrichInstagram(late, igCap), sleep(25_000)]);
        }
      }
      await progress(80, "Enriquecendo Instagram");
      // Tier primeiro (igual ao gen-service): Instagram sem site é a
      // melhor oportunidade — lead que já vive de rede social e não tem
      // presença própria. Dentro do tier, score de contato/prova social.
      const tier = (p: NormalizedPlace) => {
        const ig = Boolean(p.instagram);
        const noSite = !p.site;
        const weakSite = p.siteCheck?.estado === "fora" ||
          p.siteCheck?.estado === "desatualizado";
        if (ig && noSite) return 0;
        if (ig && weakSite) return 1;
        if (!ig && noSite) return 2;
        return 3;
      };
      resultados.sort((a, b) => {
        const score = (p: NormalizedPlace) =>
          (p.telefone ? 4 : 0) + (p.whatsapp === true ? 2 : 0) +
          (p.instagram ? 1.5 : 0) +
          (p.status === "OPERATIONAL" ? 1 : 0) + (p.avaliacao ?? 0) / 10 +
          (!p.site ? 3 : p.siteCheck?.estado === "fora" ? 2.5
            : p.siteCheck?.estado === "desatualizado" ? 2 : 0);
        return tier(a) - tier(b) || score(b) - score(a);
      });
      if (resultados.length > planTarget) resultados = resultados.slice(0, planTarget);

      // Resultados que já são lead salvo: match por place_id → "Ver lead"
      // e badge de site gerado, evitando salvar duplicado.
      const placeIds = resultados.map((p) => p.id).filter((x): x is string => Boolean(x));
      if (!isDemo && placeIds.length) {
        const { data: existentes } = await db.from("leads")
          .select("id,place_id").eq("user_id", user.id).in("place_id", placeIds);
        const byPlace = new Map(
          (existentes ?? []).map((l) => [l.place_id as string, l.id as string]),
        );
        const leadIds = [...byPlace.values()];
        const comSite = new Set<string>();
        if (leadIds.length) {
          const { data: outs } = await db.from("lead_outputs")
            .select("lead_id").in("lead_id", leadIds).eq("tipo", "generate_site");
          for (const o of outs ?? []) {
            if (o.lead_id) comSite.add(o.lead_id as string);
          }
        }
        for (const p of resultados) {
          const lid = p.id ? byPlace.get(p.id) : undefined;
          if (lid) { p.leadId = lid; p.sitePronto = comSite.has(lid); }
        }
      }

      await progress(92, "Ordenando oportunidades");
      if (!isDemo) await settleAction(db, user.id, requestRef ?? "", "completed");

      // Buscas reais feitas por admin ficam salvas para replay (upsert por query).
      if (isAdmin && resultados.length > 0) {
        await db.from("search_runs").upsert({
          query,
          provider: provedor,
          results: resultados,
          created_by: user.id,
          created_at: new Date().toISOString(),
        }, { onConflict: "query_norm" });
      }

      return json({
        resultados: isDemo ? resultados.slice(0, 12) : resultados,
        provedor,
        demo: isDemo || undefined,
        creditosCobrados: reservation.cost,
      });
    } catch (err) {
      if (!isDemo) await settleAction(db, user.id, requestRef ?? "", "refunded");
      throw err;
    }
  } catch (err) {
    await notifyError({
      ...notifyCtx,
      erro: err instanceof Error ? err.message : String(err),
    });
    return fail(err);
  }
});
