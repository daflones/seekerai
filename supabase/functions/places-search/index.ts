// Busca de estabelecimentos via Google Places API (New) — Text Search.
// Chave do Google fica como secret do Supabase; consome créditos do usuário.

import {
  asString,
  fail,
  httpError,
  isRecord,
  json,
  optionalEnv,
  readJson,
  requireEnv,
  requirePost,
  requireUser,
  reserveAction,
  serviceClient,
  settleAction,
  sha256Hex,
} from "../_shared/common.ts";

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

interface SearchBody {
  query?: string;
  serviceSlug?: string;
  requestRef?: string;
  regionCode?: string;
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

    const inputHash = await sha256Hex(JSON.stringify({ query, regionCode, service }));
    const db = serviceClient();
    const reservation = await reserveAction(db, {
      userId: user.id,
      action: "search",
      businessRef: null,
      service,
      inputHash,
      requestRef,
    });

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": requireEnv("GOOGLE_PLACES_API_KEY"),
        "X-Goog-FieldMask": FIELD_MASK,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "pt-BR",
        regionCode,
        pageSize: 20,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      await settleAction(db, user.id, requestRef, "refunded");
      throw httpError(502, "Google Places indisponível no momento");
    }
    await settleAction(db, user.id, requestRef, "completed");

    const places = (Array.isArray(data.places) ? data.places : []).map((p) => {
      const place = isRecord(p) ? p : {};
      const name = isRecord(place.displayName) ? place.displayName.text : null;
      const phone = place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null;
      return {
        id: place.id ?? null,
        nome: name ?? null,
        endereco: place.formattedAddress ?? null,
        telefone: phone,
        site: place.websiteUri ?? null,
        avaliacao: place.rating ?? null,
        totalAvaliacoes: place.userRatingCount ?? null,
        status: place.businessStatus ?? null,
        categoria: isRecord(place.primaryTypeDisplayName)
          ? place.primaryTypeDisplayName.text
          : null,
      };
    });

    return json({ resultados: places, creditosCobrados: reservation.cost });
  } catch (err) {
    return fail(err);
  }
});
