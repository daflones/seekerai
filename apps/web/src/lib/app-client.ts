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

// Instagram vem de fontes diferentes como "@user", "user" ou URL completa
// (com/sem www, barra final) — normaliza pro handle antes de montar o link.
export function igHandle(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/(?:p\/)?([A-Za-z0-9_.]+)/i);
  const handle = (m ? m[1] : s.replace(/^@+/, "")).replace(/\/+$/, "");
  return /^[A-Za-z0-9_.]{1,30}$/.test(handle) ? handle : null;
}
export function igUrl(v: string | null | undefined): string | null {
  const h = igHandle(v);
  return h ? `https://instagram.com/${h}` : null;
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
  /** Horários reais do Maps — salvos no lead, usados na geração do site. */
  horariosLabel?: [string, string][] | null;
  siteCheck?: {
    estado: "bom" | "ok" | "desatualizado" | "fora";
    sinais: string[];
  } | null;
  /** Lead já salvo desse lugar (match por place_id na busca). */
  leadId?: string | null;
  /** Lead salvo já tem site gerado. */
  sitePronto?: boolean;
  /** Prioridade da busca inteligente: alta = Instagram sem site. */
  prioridade?: "alta" | "media" | "baixa" | null;
}

export function fmtCompact(n: number, lang: string): string {
  return new Intl.NumberFormat(lang === "pt" ? "pt-BR" : lang, {
    notation: "compact", maximumFractionDigits: 1,
  }).format(n);
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
  pais?: string | null;
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
