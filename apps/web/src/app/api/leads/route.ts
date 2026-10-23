import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";

const leadItem = z.object({
  id: z.string().max(300).nullish(),
  nome: z.string().trim().min(1).max(200),
  endereco: z.string().max(500).nullish(),
  bairro: z.string().max(150).nullish(),
  cidade: z.string().max(150).nullish(),
  uf: z.string().max(50).nullish(),
  telefone: z.string().max(40).nullish(),
  site: z.string().max(500).nullish(),
  avaliacao: z.number().min(0).max(5).nullish(),
  totalAvaliacoes: z.number().int().min(0).nullish(),
  categoria: z.string().max(150).nullish(),
  mapsUrl: z.string().max(800).nullish(),
  imagem: z.string().max(800).nullish(),
  whatsapp: z.boolean().nullish(),
  instagram: z.string().max(200).nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  pais: z.string().max(2).nullish(),
  siteCheck: z.object({
    estado: z.enum(["bom", "ok", "desatualizado", "fora"]),
    sinais: z.array(z.string().max(120)).max(8),
  }).nullish(),
});

const leadSchema = z.object({
  serviceSlug: z.string().regex(/^[a-z0-9_]{1,60}$/),
  id: z.string().max(300).nullish(),
  nome: z.string().trim().min(1).max(200),
  endereco: z.string().max(500).nullish(),
  bairro: z.string().max(150).nullish(),
  cidade: z.string().max(150).nullish(),
  uf: z.string().max(50).nullish(),
  telefone: z.string().max(40).nullish(),
  site: z.string().max(500).nullish(),
  avaliacao: z.number().min(0).max(5).nullish(),
  totalAvaliacoes: z.number().int().min(0).nullish(),
  categoria: z.string().max(150).nullish(),
  mapsUrl: z.string().max(800).nullish(),
  imagem: z.string().max(800).nullish(),
  whatsapp: z.boolean().nullish(),
  instagram: z.string().max(200).nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  pais: z.string().max(2).nullish(),
  dados: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (!session.profile?.consentimento_em || !session.profile.onboarding_concluido) {
    return NextResponse.json({ error: "Conclua seu cadastro antes." }, { status: 403 });
  }

  const raw = await request.text().catch(() => "");
  if (raw.length > 32_768) return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  // Salvar em lote (selecionar vários estabelecimentos da busca de uma vez).
  const bulk = z.object({
    serviceSlug: z.string().regex(/^[a-z0-9_]{1,60}$/),
    leads: z.array(leadItem).min(1).max(30),
  }).safeParse(value);
  if (bulk.success) {
    const rows = bulk.data.leads.map((item) => ({
      user_id: session.user.id,
      service_slug: bulk.data.serviceSlug,
      place_id: item.id ?? null,
      nome: item.nome,
      endereco: item.endereco ?? null,
      bairro: item.bairro ?? null,
      cidade: item.cidade ?? null,
      uf: item.uf ?? null,
      telefone: item.telefone ?? null,
      site: item.site ?? null,
      avaliacao: item.avaliacao ?? null,
      total_avaliacoes: item.totalAvaliacoes ?? null,
      categoria: item.categoria ?? null,
      maps_url: item.mapsUrl ?? null,
      imagem: item.imagem ?? null,
      whatsapp: item.whatsapp === true ? "sim" : item.whatsapp === false ? "nao" : null,
      instagram: item.instagram ?? null,
      lat: item.lat ?? null,
      lng: item.lng ?? null,
      dados: {
        ...(item.siteCheck ? { siteCheck: item.siteCheck } : {}),
        ...(item.pais ? { pais: item.pais } : {}),
      },
    }));
    // place_id nulo nunca colide; unique (user_id, place_id) ignora duplicados.
    const { data: saved, error: bulkError } = await session.supabase
      .from("leads").upsert(rows, { onConflict: "user_id,place_id", ignoreDuplicates: true })
      .select("id,place_id");
    if (bulkError) {
      return NextResponse.json({ error: "Não foi possível salvar os leads." }, { status: 400 });
    }
    const byPlace = new Map((saved ?? []).map((r: { id: string; place_id: string | null }) => [r.place_id, r.id]));
    // Recupera ids dos que já existiam (ignorados pelo upsert).
    const missing = bulk.data.leads.filter((l) => l.id && !byPlace.has(l.id));
    if (missing.length) {
      const { data: existing } = await session.supabase.from("leads").select("id,place_id")
        .eq("user_id", session.user.id)
        .in("place_id", missing.map((l) => l.id!));
      for (const r of existing ?? []) byPlace.set((r as { place_id: string }).place_id, (r as { id: string }).id);
    }
    const ids = bulk.data.leads.map((l) => (l.id ? byPlace.get(l.id) ?? null : null));
    return NextResponse.json(
      { leads: ids, salvos: (saved ?? []).length },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = leadSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do lead." }, { status: 400 });
  }
  const b = parsed.data;

  const row = {
    user_id: session.user.id,
    service_slug: b.serviceSlug,
    place_id: b.id ?? null,
    nome: b.nome,
    endereco: b.endereco ?? null,
    bairro: b.bairro ?? null,
    cidade: b.cidade ?? null,
    uf: b.uf ?? null,
    telefone: b.telefone ?? null,
    site: b.site ?? null,
    avaliacao: b.avaliacao ?? null,
    total_avaliacoes: b.totalAvaliacoes ?? null,
    categoria: b.categoria ?? null,
    maps_url: b.mapsUrl ?? null,
    imagem: b.imagem ?? null,
    whatsapp: b.whatsapp === true ? "sim" : b.whatsapp === false ? "nao" : null,
    instagram: b.instagram ?? null,
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    dados: { ...(b.dados ?? {}), ...(b.pais ? { pais: b.pais } : {}) },
  };

  // place_id nulo nunca colide; quando presente, o unique (user_id, place_id)
  // impede duplicar o mesmo estabelecimento.
  const { data, error } = await session.supabase
    .from("leads")
    .upsert(row, { onConflict: "user_id,place_id", ignoreDuplicates: true })
    .select("id,status")
    .maybeSingle();

  if (error) {
    // Sem place_id o upsert não tem conflito — cai no insert comum.
    const { data: inserted, error: insertError } = await session.supabase
      .from("leads").insert(row).select("id,status").single();
    if (insertError) return NextResponse.json({ error: "Não foi possível salvar o lead." }, { status: 400 });
    return NextResponse.json({ lead: inserted, criado: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!data) {
    // Já existia: devolve o lead existente.
    const { data: existing } = await session.supabase
      .from("leads").select("id,status")
      .eq("user_id", session.user.id).eq("place_id", b.id ?? "").maybeSingle();
    return NextResponse.json({ lead: existing ?? null, criado: false }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ lead: data, criado: true }, { headers: { "Cache-Control": "no-store" } });
}
