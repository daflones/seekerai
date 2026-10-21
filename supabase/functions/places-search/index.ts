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
import { getSetting, requireSecret } from "../_shared/secrets.ts";

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
  lat: number | null;
  lng: number | null;
  whatsapp: boolean | null;
  instagram: string | null;
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
    return {
      id: asString(place.id, 300),
      nome: isRecord(place.displayName) ? asString(place.displayName.text) : null,
      endereco: asString(place.formattedAddress),
      bairro: null,
      cidade: null,
      uf: null,
      telefone: asString(place.nationalPhoneNumber ?? place.internationalPhoneNumber),
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
    };
  });
}

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
      whatsapp: null,
      instagram: asString(p.instagramUrl ?? p.instagram, 300) ?? null,
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

/** Verifica em lote quais números têm WhatsApp via Evolution API (grátis). */
async function checkWhatsapps(places: NormalizedPlace[]): Promise<void> {
  const numbers = places
    .map((p) => p.telefone?.replace(/\D/g, "") ?? "")
    .filter((d) => d.length >= 10 && d.length <= 15)
    .map((d) => (d.startsWith("55") ? d : `55${d}`));
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
      const digits = place.telefone?.replace(/\D/g, "") ?? "";
      const phone = digits.startsWith("55") ? digits : `55${digits}`;
      place.whatsapp = exists.get(phone) ?? null;
    }
  } catch (err) {
    // Evolution indisponível não derruba a busca — whatsapp fica nulo.
    console.error("[whatsapp-batch] falhou:", err instanceof Error ? err.message : err);
  }
}

Deno.serve(async (req) => {
  try {
    requirePost(req);
    const user = await requireUser(req);
    const body = await readJson<SearchBody>(req);

    const query = asString(body.query, 300)?.trim();
    const service = asString(body.serviceSlug, 60);
    const requestRef = asString(body.requestRef, 150);
    const regionCode = (asString(body.regionCode, 2) ?? "BR").toUpperCase();
    if (!query || !service || !requestRef) {
      throw httpError(400, "Informe query, serviceSlug e requestRef");
    }

    const db = serviceClient();
    const [{ data: profile }, replay, provider] = await Promise.all([
      db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
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
    const reservation = await reserveAction(db, {
      userId: user.id,
      action: "search",
      businessRef: null,
      service,
      inputHash,
      requestRef,
    });

    try {
      const resultados = provider === "apify"
        ? await searchApify(query)
        : await searchGooglePlaces(query, regionCode);

      // Enriquecimento: Instagram separado + WhatsApp em lote (grátis) +
      // ordenação priorizando quem tem contato direto.
      for (const place of resultados) extractInstagram(place);
      await checkWhatsapps(resultados);
      resultados.sort((a, b) => {
        const score = (p: NormalizedPlace) =>
          (p.telefone ? 4 : 0) + (p.whatsapp === true ? 2 : 0) +
          (p.status === "OPERATIONAL" ? 1 : 0) + (p.avaliacao ?? 0) / 10;
        return score(b) - score(a);
      });

      await settleAction(db, user.id, requestRef, "completed");

      // Buscas reais feitas por admin ficam salvas para replay (upsert por query).
      if (isAdmin && resultados.length > 0) {
        await db.from("search_runs").upsert({
          query,
          provider,
          results: resultados,
          created_by: user.id,
          created_at: new Date().toISOString(),
        }, { onConflict: "query_norm" });
      }

      return json({ resultados, provedor: provider, creditosCobrados: reservation.cost });
    } catch (err) {
      await settleAction(db, user.id, requestRef, "refunded");
      throw err;
    }
  } catch (err) {
    return fail(err);
  }
});
