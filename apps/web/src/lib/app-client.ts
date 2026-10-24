"use client";

// Chamada às edge functions via proxy autenticado /api/actions.
export type ActionFunction = "places-search" | "ai-generate" | "whatsapp-check" | "billing-checkout";

export async function callAction<T = Record<string, unknown>>(
  funcao: ActionFunction,
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funcao, payload }),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !data) {
      return { ok: false, error: data?.error ?? "A ação não pôde ser concluída." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Sem conexão. Tente novamente." };
  }
}

// Fotos do Google chegam como "gphoto:places/.../photos/..." — resolvemos via
// proxy autenticado para não expor a chave da API no navegador.
export function placeImageSrc(imagem: string | null | undefined): string | null {
  if (!imagem) return null;
  if (imagem.startsWith("gphoto:")) {
    return `/api/place-photo?ref=${encodeURIComponent(imagem.slice(7))}`;
  }
  return imagem;
}

// Resultado normalizado de places-search.
export interface PlaceResult {
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
  pais?: string | null;
  whatsapp: boolean | null;
  instagram: string | null;
  /** Perfil do Instagram enriquecido no scrape da busca. */
  ig?: {
    seguidores: number | null;
    posts: number | null;
    curtidas: number | null;
    foto: string | null;
    bio: string | null;
    verificado: boolean;
  } | null;
  siteCheck?: {
    estado: "bom" | "ok" | "desatualizado" | "fora";
    sinais: string[];
  } | null;
}

export interface LeadRow {
  id: string;
  service_slug: string;
  place_id: string | null;
  nome: string;
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
  instagram: string | null;
  status: "novo" | "contatado" | "respondeu" | "proposta" | "ganho" | "perdido";
  whatsapp: "sim" | "nao" | null;
  notas: string | null;
  valor_fechado: number | null;
  dados?: Record<string, unknown> | null;
  created_at: string;
}

export const LEAD_STATUS = [
  ["novo", "Novo"],
  ["contatado", "Contatado"],
  ["respondeu", "Respondeu"],
  ["proposta", "Proposta"],
  ["ganho", "Ganho"],
  ["perdido", "Perdido"],
] as const;
