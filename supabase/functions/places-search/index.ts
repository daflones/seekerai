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
  if (!res.ok) throw httpError(502, "Google Places indisponível no momento");
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
      imagem: null,
      lat: null,
      lng: null,
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
    };
  });
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

    const provider = await getSetting("search_provider", "google_places");
    const inputHash = await sha256Hex(
      JSON.stringify({ query, regionCode, service, provider }),
    );
    const db = serviceClient();
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
      await settleAction(db, user.id, requestRef, "completed");
      return json({ resultados, provedor: provider, creditosCobrados: reservation.cost });
    } catch (err) {
      await settleAction(db, user.id, requestRef, "refunded");
      throw err;
    }
  } catch (err) {
    return fail(err);
  }
});
