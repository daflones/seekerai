// Busca inteligente de leads — porte do places-search (edge) pro Gen
// Service, com pipeline de qualificação: prioriza estabelecimentos com
// Instagram e sem site, expande pra região vizinha quando falta lead e
// faz fallback pra quem tem Insta + site fraco. Progresso vai pro SSE
// (/stream/:jobId) e pro banco (search_jobs.eventos) como fallback.

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
} from "./common.ts";
import { getSecret, getSetting, requireSecret } from "./secrets.ts";
import { igProfileCached, igCachePut } from "./instagram.ts";
import { notifyError, type NotifyErrorInput } from "./notify.ts";
import { callingCodeFor, toE164 } from "./phone.ts";
import { emitJobEvent } from "./bus.ts";

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
  "places.location",
  "places.photos",
  "nextPageToken",
].join(",");

const APIFY_ACTOR = "compass~crawler-google-places";
const APIFY_IG_ACTOR = "apify~instagram-scraper";

interface SearchBody {
  query?: string;
  serviceSlug?: string;
  requestRef?: string;
  regionCode?: string;
  jobId?: string;
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
  horariosLabel?: [string, string][] | null;
  ig?: IgProfile | null;
  siteCheck?: SiteCheck | null;
  leadId?: string | null;
  sitePronto?: boolean;
  /** Prioridade da busca inteligente: alta = Insta sem site. */
  prioridade?: "alta" | "media" | "baixa";
}

interface IgProfile {
  seguidores: number | null;
  posts: number | null;
  curtidas: number | null;
  foto: string | null;
  bio: string | null;
  verificado: boolean;
}

interface SiteCheck {
  estado: "bom" | "ok" | "desatualizado" | "fora";
  sinais: string[];
}

/** Viés geográfico pra rodadas de expansão (localidade próxima). */
interface GeoBias { lat: number; lng: number; radiusM: number }

interface LeadSearchConfig {
  targets: Record<string, number>;
  poolMultiplier: number;
  smartFilter: boolean;
  expandRounds: number;
  expandRadiusKm: number;
  fallbackSiteOk: boolean;
}

const DEFAULT_SEARCH_CFG: LeadSearchConfig = {
  targets: { default: 20, essencial: 20, pro: 40, king: 60 },
  poolMultiplier: 2,
  smartFilter: true,
  expandRounds: 2,
  expandRadiusKm: 25,
  fallbackSiteOk: true,
};

async function searchConfig(): Promise<LeadSearchConfig> {
  const raw = await getSetting<Record<string, unknown>>("lead_search", {});
  const cfg = { ...DEFAULT_SEARCH_CFG };
  if (isRecord(raw)) {
    if (isRecord(raw.targets)) {
      for (const [k, v] of Object.entries(raw.targets)) {
        if (typeof v === "number" && v >= 5 && v <= 200) cfg.targets[k] = Math.trunc(v);
      }
    }
    if (typeof raw.pool_multiplier === "number") {
      cfg.poolMultiplier = Math.min(4, Math.max(1, raw.pool_multiplier));
    }
    if (typeof raw.smart_filter === "boolean") cfg.smartFilter = raw.smart_filter;
    if (typeof raw.expand_rounds === "number") {
      cfg.expandRounds = Math.min(4, Math.max(0, Math.trunc(raw.expand_rounds)));
    }
    if (typeof raw.expand_radius_km === "number") {
      cfg.expandRadiusKm = Math.min(100, Math.max(5, raw.expand_radius_km));
    }
    if (typeof raw.fallback_site_ok === "boolean") cfg.fallbackSiteOk = raw.fallback_site_ok;
  }
  return cfg;
}

/* ---------- provedores (mesma cadeia da edge) ---------- */

async function searchGooglePlaces(
  query: string, regionCode: string, pages = 1, bias?: GeoBias,
): Promise<NormalizedPlace[]> {
  const key = await requireSecret("GOOGLE_PLACES_API_KEY");
  const all: Record<string, unknown>[] = [];
  let pageToken: string | null = null;
  for (let p = 0; p < pages; p++) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "pt-BR",
        regionCode,
        pageSize: 20,
        ...(bias ? {
          locationBias: {
            circle: {
              center: { latitude: bias.lat, longitude: bias.lng },
              radius: bias.radiusM,
            },
          },
        } : {}),
        ...(pageToken ? { pageToken } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = isRecord(data.error) ? asString(data.error.message, 300) : null;
      console.error("[search] Google respondeu", res.status, detail ?? "");
      if (!all.length) throw httpError(502, "Google Places indisponível no momento");
      break;
    }
    const batch = (Array.isArray(data.places) ? data.places : []) as Record<string, unknown>[];
    all.push(...batch);
    pageToken = asString(data.nextPageToken, 300);
    if (!pageToken || !batch.length) break;
    if (p < pages - 1) await sleep(2000);
  }
  return all.map((p) => {
    const place = isRecord(p) ? p : {};
    const comps = (Array.isArray(place.addressComponents) ? place.addressComponents : [])
      .filter(isRecord);
    const comp = (...types: string[]) =>
      comps.find((c) =>
        Array.isArray(c.types) && types.some((t) => (c.types as unknown[]).includes(t)));
    const loc = isRecord(place.location) ? place.location : {};
    return {
      id: asString(place.id, 300),
      nome: isRecord(place.displayName) ? asString(place.displayName.text) : null,
      endereco: asString(place.formattedAddress),
      bairro: asString(comp("neighborhood", "sublocality_level_1")?.longText, 150),
      cidade: asString(comp("locality", "postal_town", "administrative_area_level_2")?.longText, 150),
      uf: asString(comp("administrative_area_level_1")?.shortText, 50),
      pais: asString(comp("country")?.shortText, 2)?.toUpperCase() ?? null,
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
      imagem: (() => {
        const photos = Array.isArray(place.photos) ? place.photos : [];
        const name = isRecord(photos[0]) ? asString(photos[0].name, 500) : null;
        return name ? `gphoto:${name}` : null;
      })(),
      lat: typeof loc.latitude === "number" ? loc.latitude : null,
      lng: typeof loc.longitude === "number" ? loc.longitude : null,
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

async function searchApify(
  query: string, target = 20, bias?: GeoBias,
): Promise<NormalizedPlace[]> {
  const token = await requireSecret("APIFY_API_TOKEN");
  // O actor aceita texto livre — "perto de lat,lng" vira viés real no Maps.
  const q = bias ? `${query} near ${bias.lat},${bias.lng}` : query;
  const res = await fetch(
    `https://api.apify.com/v2/actors/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [q],
        maxCrawledPlacesPerSearch: target,
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

/** Serper.dev /maps — horários em pt-BR, thumbnail e categoria local. */
async function searchSerper(
  query: string, regionCode: string, pages = 1, bias?: GeoBias,
): Promise<NormalizedPlace[]> {
  const keys = [
    await getSecret("SERPER_API_KEY"),
    await getSecret("SERPER_API_KEY_2"),
    await getSecret("SERPER_API_KEY_3"),
    await getSecret("SERPER_API_KEY_4"),
    await getSecret("SERPER_API_KEY_5"),
    await getSecret("SERPER_API_KEY_6"),
    await getSecret("SERPER_API_KEY_7"),
  ].filter((k): k is string => Boolean(k));
  if (!keys.length) throw httpError(502, "Serper não configurado");
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
          // Viés da expansão: "@lat,lng,zoom" centra o mapa na região nova.
          ...(bias && page === 1 ? { ll: `@${bias.lat},${bias.lng},14z` } : {}),
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
  if (pages > 1 && ll) {
    pages_.push(...await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => fetchPage(i + 2, ll)),
    ));
  }
  const places = pages_.flatMap((data) =>
    isRecord(data) && Array.isArray(data.places) ? data.places : []);
  if (!places.length) throw httpError(502, "Serper não retornou resultados");

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

/* ---------- enriquecimento (idêntico à edge) ---------- */

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
    if (prof.whatsapp && !p.telefone) {
      p.telefone = `+${prof.whatsapp}`;
      p.whatsapp = true;
    }
  };

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

  let token: string;
  try {
    token = await requireSecret("APIFY_API_TOKEN");
  } catch {
    return;
  }
  const igHandleOf = (v: string) => {
    const m = v.match(/instagram\.com\/(?:p\/)?([A-Za-z0-9_.]+)/i);
    return (m ? m[1] : v.replace(/^@+/, "")).replace(/\/+$/, "");
  };
  const urls = misses
    .map((p) => igHandleOf(p.instagram!))
    .filter((h) => /^[A-Za-z0-9_.]{1,30}$/.test(h))
    .map((h) => `https://www.instagram.com/${h}/`);
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

function instagramFromHtml(html: string): string | null {
  const match = html.match(
    /instagram\.com\/(?!p\/|reel|explore|stories|tv)([A-Za-z0-9._]{2,40})/i,
  );
  if (!match) return null;
  const handle = match[1].replace(/\.+$/, "");
  return /^[A-Za-z0-9._]{2,40}$/.test(handle) ? `@${handle}` : null;
}

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

async function scanWebsites(places: NormalizedPlace[]): Promise<void> {
  const comSite = places.filter((p) => p.site).slice(0, 30);
  const batch = 12;
  for (let i = 0; i < comSite.length; i += batch) {
    await Promise.all(
      comSite.slice(i, i + batch).map(async (p) => {
        try {
          const { instagram, ...check } = await scanWebsite(p.site!);
          p.siteCheck = check;
          if (instagram && !p.instagram) p.instagram = instagram;
        } catch {
          p.siteCheck = null;
        }
      }),
    );
  }
}

async function checkWhatsapps(places: NormalizedPlace[], regionCode: string): Promise<void> {
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
    console.error("[whatsapp-batch] falhou:", err instanceof Error ? err.message : err);
  }
}

/* ---------- classificação inteligente ---------- */

// Quanto menor o tier, melhor o lead pro objetivo do produto:
//   0 = Instagram + sem site   → o lead dos sonhos
//   1 = Instagram + site fraco/qualquer (fallback_site_ok)
//   2 = sem Instagram + sem site
//   3 = resto (site bom ou sem IG com site)
function leadTier(p: NormalizedPlace, fallbackSiteOk: boolean): number {
  const temIg = Boolean(p.instagram);
  const temSite = Boolean(p.site);
  if (temIg && !temSite) return 0;
  if (temIg && temSite) {
    if (!fallbackSiteOk) return 3;
    return p.siteCheck?.estado === "bom" ? 3 : 1;
  }
  if (!temIg && !temSite) return 2;
  return 3;
}

function leadScore(p: NormalizedPlace): number {
  return (p.telefone ? 4 : 0) + (p.whatsapp === true ? 2 : 0) +
    (p.instagram ? 1.5 : 0) +
    (p.status === "OPERATIONAL" ? 1 : 0) + (p.avaliacao ?? 0) / 10 +
    (!p.site ? 3 : p.siteCheck?.estado === "fora" ? 2.5
      : p.siteCheck?.estado === "desatualizado" ? 2 : 0);
}

function prioridadeOf(tier: number): "alta" | "media" | "baixa" {
  return tier === 0 ? "alta" : tier <= 2 ? "media" : "baixa";
}

/** Versão enxuta pro feed ao vivo — o card se forma enquanto busca. */
function litePlace(p: NormalizedPlace) {
  return {
    id: p.id, nome: p.nome, imagem: p.imagem, cidade: p.cidade, uf: p.uf,
    instagram: p.instagram, site: p.site,
    siteCheck: p.siteCheck ? { estado: p.siteCheck.estado } : null,
    whatsapp: p.whatsapp, avaliacao: p.avaliacao, totalAvaliacoes: p.totalAvaliacoes,
    categoria: p.categoria, prioridade: p.prioridade ?? null,
  };
}

/* ---------- orquestração ---------- */

export async function handleSearch(req: Request): Promise<Response> {
  const notifyCtx: NotifyErrorInput = { onde: "places-search", erro: "" };
  try {
    requirePost(req);
    const isDemo = req.headers.get("x-seeker-demo") ===
      (await sha256Hex(`seeker-demo:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`))
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
    // Progresso: SSE em tempo real + RPC atômico no banco (fallback).
    const progress = async (p: number, etapa: string) => {
      if (!jobId) return;
      emitJobEvent(jobId, p, etapa);
      await db.rpc("report_job_event", {
        p_table: "search_jobs", p_id: jobId,
        p_pct: p, p_etapa: etapa,
      }).then(() => {}, () => {});
    };
    // Estabelecimentos confirmados aparecem ao vivo no feed do usuário.
    const emitAchados = (places: NormalizedPlace[], p: number, etapa: string) => {
      if (!jobId || !places.length) return;
      emitJobEvent(jobId, p, etapa, { achados: places.map(litePlace) });
    };

    const [{ data: profile }, { data: sub }, replay, provider, cfg] = await Promise.all([
      isDemo
        ? Promise.resolve({ data: null })
        : db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      isDemo
        ? Promise.resolve({ data: null })
        : db.from("subscriptions").select("plans(slug)").eq("user_id", user.id)
          .eq("status", "active").limit(1).maybeSingle(),
      getSetting("search_replay", "off"),
      getSetting("search_provider", "google_places"),
      searchConfig(),
    ]);
    const isAdmin = profile?.role === "admin";
    const planSlug = (sub?.plans as { slug?: unknown } | null)?.slug;
    const planSlugStr = typeof planSlug === "string" ? planSlug : "default";
    // Quantos leads a busca tenta entregar — configurável por plano no admin.
    const planTarget = isDemo ? 15
      : isAdmin ? (cfg.targets.king ?? 60)
      : (cfg.targets[planSlugStr] ?? cfg.targets.default ?? 20);
    // Pool maior que o target: a filtragem inteligente descarta parte dos
    // resultados, então busca-se a mais pra sobrar lead qualificado.
    const poolTarget = cfg.smartFilter
      ? Math.min(150, Math.ceil(planTarget * cfg.poolMultiplier))
      : planTarget;
    const providerPages = Math.max(1, Math.ceil(poolTarget / 20));

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
      service: service ?? "",
      inputHash,
      requestRef: requestRef ?? "",
    });

    try {
      const runProviders = async (bias?: GeoBias, target = poolTarget, pages = providerPages) => {
        const providers: [string, () => Promise<NormalizedPlace[]>][] = [
          ["google_places", () => searchGooglePlaces(query, regionCode, pages, bias)],
          ["apify", () => searchApify(query, target, bias)],
          ["serper", () => searchSerper(query, regionCode, pages, bias)],
        ].sort((a) => a[0] === provider ? -1 : 0) as [
          string,
          () => Promise<NormalizedPlace[]>,
        ][];
        let lastErr: unknown = null;
        for (const [name, run] of providers) {
          try {
            return { resultados: await run(), provedor: name };
          } catch (err) {
            lastErr = err;
            console.error(
              `[search] ${name} falhou, tentando próximo:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
        throw lastErr instanceof Error ? lastErr : httpError(502, "Busca indisponível no momento. Tente novamente em instantes.");
      };

      await progress(10, "Consultando provedores de mapa");
      let round = await runProviders();
      let resultados = round.resultados;
      const provedor = round.provedor;

      // Dedup global — a expansão pode re-trazer lugar já visto.
      const seen = new Set<string>();
      const keyOf = (p: NormalizedPlace) =>
        (p.id ?? `${p.nome}|${p.endereco}`).toLowerCase();
      resultados = resultados.filter((p) => {
        const k = keyOf(p);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      await progress(30, `${resultados.length} estabelecimentos encontrados`);
      if (isDemo) resultados = resultados.slice(0, 15);
      for (const place of resultados) extractInstagram(place);

      // Enriquecimento do pool inteiro: WhatsApp + varredura de sites
      // (que também revela o @ no HTML) + perfis de Instagram.
      const igCap = Math.min(24, Math.max(8, Math.ceil(poolTarget / 4)));
      const enrichBatch = async (batch: NormalizedPlace[]) => {
        if (!batch.length) return;
        const early = batch.filter((p) => p.instagram).slice(0, igCap);
        const earlyHandles = new Set(early.map((p) => p.instagram!.toLowerCase()));
        const igEarly = isDemo || !early.length ? null
          : Promise.race([enrichInstagram(early, igCap), sleep(40_000)]);
        await Promise.all([
          checkWhatsapps(batch, regionCode),
          scanWebsites(batch),
        ]);
        if (!isDemo) {
          await igEarly;
          const late = batch
            .filter((p) => p.instagram && !earlyHandles.has(p.instagram!.toLowerCase()))
            .slice(0, igCap);
          if (late.length) {
            await Promise.race([enrichInstagram(late, igCap), sleep(25_000)]);
          }
        }
      };

      await progress(45, "Analisando sites e Instagram");
      await enrichBatch(resultados);

      // Feed ao vivo: os melhores leads confirmados vão aparecendo.
      const qualifiedNow = () =>
        resultados.filter((p) => leadTier(p, cfg.fallbackSiteOk) <= 1)
          .sort((a, b) => leadTier(a, cfg.fallbackSiteOk) - leadTier(b, cfg.fallbackSiteOk)
            || leadScore(b) - leadScore(a));
      const emitTop = (n: number) => {
        const top = qualifiedNow().slice(0, n);
        if (top.length) emitAchados(top, 60, `${top.length} com Instagram${top.some((p) => !p.site) ? " e sem site" : ""}`);
      };
      emitTop(12);

      // Rodadas de expansão: se falta lead qualificado, re-busca com
      // viés num ponto ~raio km ao lado do centróide dos resultados —
      // "outra localidade próxima" sem saber o nome das cidades.
      const centroid = () => {
        const pts = resultados.filter((p) => p.lat !== null && p.lng !== null);
        if (!pts.length) return null;
        return {
          lat: pts.reduce((a, p) => a + p.lat!, 0) / pts.length,
          lng: pts.reduce((a, p) => a + p.lng!, 0) / pts.length,
        };
      };
      // Direções alternadas (N, L, S, O) a cada rodada.
      const offsetKm = (c: { lat: number; lng: number }, km: number, dir: number) => {
        const dLat = km / 111;
        const dLng = km / (111 * Math.cos((c.lat * Math.PI) / 180));
        const dirs = [
          { la: dLat, ln: 0 }, { la: 0, ln: dLng },
          { la: -dLat, ln: 0 }, { la: 0, ln: -dLng },
        ];
        const d = dirs[dir % dirs.length];
        return { lat: c.lat + d.la, lng: c.lng + d.ln, radiusM: km * 1000 };
      };

      let expandRound = 0;
      while (
        cfg.smartFilter && cfg.expandRounds > 0 &&
        qualifiedNow().length < planTarget && expandRound < cfg.expandRounds
      ) {
        const c = centroid();
        if (!c) break;
        expandRound++;
        await progress(55 + expandRound * 8,
          `Expandindo pra região vizinha (${expandRound}/${cfg.expandRounds})`);
        const bias = offsetKm(c, cfg.expandRadiusKm, expandRound - 1);
        let extra: NormalizedPlace[];
        try {
          const r = await runProviders(bias, Math.ceil(poolTarget / 2), Math.max(1, Math.ceil(poolTarget / 40)));
          extra = r.resultados.filter((p) => !seen.has(keyOf(p)));
          for (const p of extra) seen.add(keyOf(p));
        } catch {
          break; // provedor fora na expansão — entrega o que tem
        }
        if (!extra.length) break;
        resultados.push(...extra);
        for (const p of extra) extractInstagram(p);
        await enrichBatch(extra);
        emitTop(12);
      }

      await progress(78, "Ordenando oportunidades");

      // Classificação final + ordenação: tier primeiro, score depois.
      for (const p of resultados) {
        const tier = leadTier(p, cfg.fallbackSiteOk);
        p.prioridade = prioridadeOf(tier);
      }
      resultados.sort((a, b) => {
        const ta = leadTier(a, cfg.fallbackSiteOk);
        const tb = leadTier(b, cfg.fallbackSiteOk);
        return ta - tb || leadScore(b) - leadScore(a);
      });
      // Fallback sem siteOk: quem tem Insta+site bom desce pro fim, mas
      // ainda entra se sobrar vaga (lead é lead).
      if (resultados.length > planTarget) resultados = resultados.slice(0, planTarget);
      emitAchados(resultados.slice(0, 12), 92, "Leads qualificados");

      // Resultados que já são lead salvo: match por place_id.
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

      await progress(95, "Concluída");
      if (!isDemo) await settleAction(db, user.id, requestRef ?? "", "completed");

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
}
