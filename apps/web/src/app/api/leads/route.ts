import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";

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
  lat: z.number().nullish(),
  lng: z.number().nullish(),
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
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    dados: b.dados ?? {},
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
