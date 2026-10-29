// Busca de estabelecimentos — provedor configurável no admin (app_settings):
//   "google_places" → Places API (New) Text Search
//   "apify"         → Actor compass~crawler-google-places (run-sync)
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
import { igProfileCached, igCachePut } from "../_shared/instagram.ts";
import { notifyError, NotifyErrorInput } from "../_shared/notify.ts";
import { callingCodeFor, toE164 } from "../_shared/phone.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "places.regularOpeningHours.openNow",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.addressComponents",
  "places.photos",
].join(",");

const APIFY_ACTOR = "compass~crawler-google-places";

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

async function searchGooglePlaces(query: string, regionCode: string): Promise<NormalizedPlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": await requireSecret("GOOGLE_PLACES_API_KEY"),
      "X-Goog-FieldMask": FIELD_MASK,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "pt-BR",
      regionCode,
      pageSize: 20,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = isRecord(data.error) ? asString(data.error.message, 300) : null;
    console.error("[places-search] Google respondeu", res.status, detail ?? "");
    throw httpError(502, "Google Places indisponível no momento");
  }
  return (Array.isArray(data.places) ? data.places : []).map((p) => {
    const place = isRecord(p) ? p : {};
    // País/cidade/bairro saem dos addressComponents — alimenta o código de
    // discagem correto pra verificação de WhatsApp em qualquer país.
    const comps = (Array.isArray(place.addressComponents) ? place.addressComponents : [])
      .filter(isRecord);
    const comp = (...types: string[]) =>
      comps.find((c) =>
        Array.isArray(c.types) && types.some((t) => (c.types as unknown[]).includes(t)));
    return {
      id: asString(place.id, 300),
      nome: isRecord(place.displayName) ? asString(place.displayName.text) : null,
      endereco: asString(place.formattedAddress),
      bairro: asString(comp("neighborhood", "sublocality_level_1")?.longText, 150),
      cidade: asString(comp("locality", "postal_town", "administrative_area_level_2")?.longText, 150),
      uf: asString(comp("administrative_area_level_1")?.shortText, 50),
      pais: asString(comp("country")?.shortText, 2)?.toUpperCase() ?? null,
      // Internacional primeiro: vem com "+DDI" e alimenta a verificação de WhatsApp.
      telefone: asString(place.internationalPhoneNumber ?? place.nationalPhoneNumber),
      site: asString(place.websiteUri, 500),
      avaliacao: typeof place.rating === "number" ? place.rating : null,
      totalAvaliacoes:
        typeof place.userRatingCount === "number" ? place.userRatingCount : null,
      status: asString(place.businessStatus),
      categoria: isRecord(place.primaryTypeDisplayName)
        ? asString(place.primaryTypeDisplayName.text)
        : null,
      mapsUrl: null,
      // Referência da foto (places/.../photos/...) — resolvida via /api/place-photo,
      // assim a chave do Google nunca chega ao navegador.
      imagem: (() => {
        const photos = Array.isArray(place.photos) ? place.photos : [];
        const name = isRecord(photos[0]) ? asString(photos[0].name, 500) : null;
        return name ? `gphoto:${name}` : null;
      })(),
      lat: null,
      lng: null,
      whatsapp: null,
      instagram: null,
      horariosLabel: parseWeekdayDescriptions(
        isRecord(place.regularOpeningHours)
          ? place.regularOpeningHours.weekdayDescriptions
          : null,
      ),
    };
  });
}

/** "segunda-feira: 09:00–19:00" (já localizado) → ["Segunda-feira","09:00–19:00"]. */
function parseWeekdayDescriptions(list: unknown): [string, string][] | null {
  const out = (Array.isArray(list) ? list : [])
    .flatMap((d): [string, string][] => {
      const m = asString(d, 200)?.match(/^(.+?):\s*(.+)$/);
      if (!m) return [];
      return [[m[1][0].toUpperCase() + m[1].slice(1), m[2].trim()]];
    });
  return out.length ? out : null;
}

const DAY_PT_SEARCH: Record<string, string> = {
  monday: "Segunda", tuesday: "Terça", wednesday: "Quarta", thursday: "Quinta",
  friday: "Sexta", saturday: "Sábado", sunday: "Domingo",
};

async function searchApify(query: string): Promise<NormalizedPlace[]> {
  const token = await requireSecret("APIFY_API_TOKEN");
  const res = await fetch(
    `https://api.apify.com/v2/actors/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: 20,
        language: "pt-BR",
        maxReviews: 0,
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const items = (await res.json().catch(() => [])) as unknown;
  if (!res.ok) throw httpError(502, "Apify indisponível no momento");
  return (Array.isArray(items) ? items : []).map((item) => {
    const p = isRecord(item) ? item : {};
    const loc = isRecord(p.location) ? p.location : {};
    return {
      id: asString(p.placeId ?? p.fid ?? p.cid, 300),
      nome: asString(p.title),
      endereco: asString(p.address, 500),
      bairro: asString(p.neighborhood),
      cidade: asString(p.city),
      uf: asString(p.state),
      telefone: asString(p.phone ?? p.phoneUnformatted),
      site: asString(p.website, 500),
      avaliacao: typeof p.totalScore === "number" ? p.totalScore : null,
      totalAvaliacoes: typeof p.reviewsCount === "number" ? p.reviewsCount : null,
      status: p.permanentlyClosed === true
        ? "CLOSED_PERMANENTLY"
        : p.temporarilyClosed === true
          ? "CLOSED_TEMPORARILY"
          : "OPERATIONAL",
      categoria: asString(p.categoryName) ??
        (Array.isArray(p.categories) && typeof p.categories[0] === "string"
          ? p.categories[0]
          : null),
      mapsUrl: asString(p.url, 800),
      imagem: asString(p.imageUrl, 800),
      lat: typeof loc.lat === "number" ? loc.lat : null,
      lng: typeof loc.lng === "number" ? loc.lng : null,
      pais: asString(p.countryCode, 2)?.toUpperCase() ?? null,
      whatsapp: null,
      instagram: asString(p.instagramUrl ?? p.instagram, 300) ?? null,
      // openingHours: [{day:"Monday", hours:"9:00 AM to 7:00 PM"}] — os
      // horários reais do Maps chegam ao site via dados.horariosLabel.
      horariosLabel: (() => {
        const out = (Array.isArray(p.openingHours) ? p.openingHours : [])
          .flatMap((d): [string, string][] => {
            if (!isRecord(d)) return [];
            const day = DAY_PT_SEARCH[(asString(d.day, 30) ?? "").toLowerCase()];
            const hours = asString(d.hours, 120);
            return day && hours ? [[day, hours]] : [];
          });
        return out.length ? out : null;
      })(),
    };
  });
}

/**
 * Serper.dev /maps — raspador de Google Maps barato (~$1/1k buscas).
 * Devolve dados que nem o Places New traz: horários em pt-BR,
 * thumbnail e category em português. Terceira fonte da cadeia.
 */
async function searchSerper(query: string, regionCode: string): Promise<NormalizedPlace[]> {
  // Chave principal + reserva (SERPER_API_KEY_2): se a primeira falhar
  // (cota, rate limit, outage) tenta a segunda antes de desistir.
  const keys = [
    await getSecret("SERPER_API_KEY"),
    await getSecret("SERPER_API_KEY_2"),
  ].filter((k): k is string => Boolean(k));
  if (!keys.length) throw httpError(502, "Serper não configurado");
  let res: Response | null = null;
  for (const key of keys) {
    res = await fetch("https://google.serper.dev/maps", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: query,
        gl: regionCode.toLowerCase(),
        hl: "pt-br",
        num: 20,
      }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (res?.ok) break;
    res = null;
  }
  if (!res?.ok) throw httpError(502, "Serper indisponível no momento");
  const data = await res.json().catch(() => null);
  const places = isRecord(data) && Array.isArray(data.places) ? data.places : [];
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
      pais: "BR",
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

const APIFY_IG_ACTOR = "apify~instagram-scraper";

async function igApifyCall(token: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown[]> {
  const res = await fetch(
    `https://api.apify.com/v2/actors/${APIFY_IG_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${Math.round(timeoutMs / 1000)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs + 15_000),
    },
  ).catch(() => null);
  if (!res?.ok) {
    console.error("[ig-enrich] apify falhou:", res?.status ?? "network");
    return [];
  }
  const items = (await res.json().catch(() => [])) as unknown[];
  return Array.isArray(items) ? items : [];
}

/**
 * Enriquecimento Instagram: depois que o Maps revela o @, uma chamada
 * batelada no instagram-scraper traz perfil (seguidores/posts/foto/bio)
 * e os últimos posts (média de curtidas + mídia/legendas pro site).
 * Capado em 8 perfis e corrido com timeout — nunca derruba a busca.
 */
async function enrichInstagram(places: NormalizedPlace[]): Promise<void> {
  const comIg = places.filter((p) => p.instagram).slice(0, 8);
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

  // Fonte 1: cache (7d) + ScrapeCreators — barato, por handle.
  const misses: NormalizedPlace[] = [];
  await Promise.all(comIg.map(async (p) => {
    const handle = p.instagram!.replace(/^@/, "");
    try {
      const prof = await igProfileCached(handle);
      if (prof) applyProfile(p, prof);
      else misses.push(p);
    } catch {
      misses.push(p);
    }
  }));
  if (!misses.length) return;

  // Fonte 2: Apify batelado — só pros que o ScrapeCreators não achou.
  let token: string;
  try {
    token = await requireSecret("APIFY_API_TOKEN");
  } catch {
    return;
  }
  const urls = misses.map((p) => `https://www.instagram.com/${p.instagram!.replace(/^@/, "")}/`);
  // Uma chamada só: "details" volta rápido (~10s) e já traz latestPosts
  // com curtidas — o resultsType "posts" estoura o tempo e nunca retorna.
  const details = await Promise.race([
    igApifyCall(token, { directUrls: urls, resultsType: "details", resultsLimit: misses.length }, 55_000),
    sleep(48_000).then(() => [] as unknown[]),
  ]);

  const profiles = new Map<string, Record<string, unknown>>();
  for (const d of details) {
    if (!isRecord(d)) continue;
    const uname = asString(d.username, 80)?.toLowerCase();
    if (uname) profiles.set(uname, d);
  }
  for (const p of misses) {
    const uname = p.instagram!.replace(/^@/, "").toLowerCase();
    const prof = profiles.get(uname);
    if (!prof) continue;
    const recent = (Array.isArray(prof.latestPosts) ? prof.latestPosts : [])
      .filter(isRecord);
    const likes = recent
      .map((post) => (typeof post.likesCount === "number" ? post.likesCount : null))
      .filter((n): n is number => n !== null);
    const normalized = {
      seguidores: typeof prof.followersCount === "number" ? prof.followersCount : null,
      posts: typeof prof.postsCount === "number" ? prof.postsCount
        : recent.length || null,
      curtidas: likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null,
      foto: asString(prof.profilePicUrl, 1000),
      bio: asString(prof.biography, 600),
      verificado: prof.verified === true,
    };
    applyProfile(p, normalized);
    await igCachePut(uname, "perfil", normalized);
  }
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
  const comSite = places.filter((p) => p.site);
  const batch = 6;
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
    const progress = async (p: number, etapa: string) => {
      if (!jobId) return;
      await db.from("search_jobs")
        .update({ progresso: p, etapa, updated_at: new Date().toISOString() })
        .eq("id", jobId).eq("status", "running")
        .then(() => {}, () => {});
    };
    const [{ data: profile }, replay, provider] = await Promise.all([
      isDemo
        ? Promise.resolve({ data: null })
        : db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      getSetting("search_replay", "off"),
      getSetting("search_provider", "google_places"),
    ]);
    const isAdmin = profile?.role === "admin";

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
      // Provedor configurado primeiro; se cair, a busca segue pelos
      // outros (Apify sem crédito → Google Places → Serper).
      const providers: [string, () => Promise<NormalizedPlace[]>][] = [
        ["google_places", () => searchGooglePlaces(query, regionCode)],
        ["apify", () => searchApify(query)],
        ["serper", () => searchSerper(query, regionCode)],
      ].sort((a) => a[0] === provider ? -1 : 0) as [
        string,
        () => Promise<NormalizedPlace[]>,
      ][];

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
        throw lastErr instanceof Error
          ? lastErr
          : httpError(502, "Busca indisponível no momento");
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
      await Promise.all([
        checkWhatsapps(resultados, regionCode),
        scanWebsites(resultados),
      ]);
      await progress(62, "Verificando WhatsApp e sites");
      if (!isDemo) {
        await Promise.race([enrichInstagram(resultados), sleep(55_000)]);
      }
      await progress(80, "Enriquecendo Instagram");
      resultados.sort((a, b) => {
        const score = (p: NormalizedPlace) =>
          (p.telefone ? 4 : 0) + (p.whatsapp === true ? 2 : 0) +
          (p.status === "OPERATIONAL" ? 1 : 0) + (p.avaliacao ?? 0) / 10 +
          (!p.site ? 3 : p.siteCheck?.estado === "fora" ? 2.5
            : p.siteCheck?.estado === "desatualizado" ? 2 : 0);
        return score(b) - score(a);
      });

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
