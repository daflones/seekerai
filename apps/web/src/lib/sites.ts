import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Configuração multi-tenant dos sites premium (/site/<slug>).
// Cada linha em `sites` carrega tudo que a interface precisa — nenhum dado
// do estabelecimento fica hard-coded nos componentes.

export interface SiteServico {
  nome: string;
  duracaoMin: number | null;
  preco: number | null;
  categoria?: string;
  descricao?: string;
}

export interface SiteConfig {
  tipo: "barbearia" | string;
  nome: string;
  marca: string;
  logo?: string;
  tagline?: string;
  cidade?: string;
  tema?: { accent?: string };
  contato: {
    telefone?: string;
    whatsapp?: string;
    instagram?: string;
    endereco?: string;
    mapsUrl?: string;
  };
  /** Horários por dia da semana (0=dom): lista de janelas [abre, fecha]. null = fechado. */
  horarios: Record<string, [string, string][] | null>;
  horariosLabel?: [string, string][];
  servicos: SiteServico[];
  profissionais?: { nome: string; especialidade?: string; foto?: string }[];
  fotos: { hero?: string; galeria: string[] };
  videos?: { src: string; titulo: string; descricao?: string; destaque?: boolean }[];
  historia?: { titulo: string; paragrafos: string[] };
  diferenciais?: string[];
  avaliacoes?: {
    nota: number;
    total: number;
    fonte: string;
    itens?: { autor: string; nota?: number; texto: string; quando?: string }[];
    /** Print/depoimento real em imagem (ex.: recado de cliente no WhatsApp). */
    print?: string;
  };
  faq?: { q: string; a: string }[];
  booking: { slotMin: number; diasFuturos: number; antecedenciaMin: number };
  seo?: { title?: string; description?: string };
}

export interface SiteRow {
  slug: string;
  tipo: string;
  nome: string;
  lead_id: string | null;
  config: SiteConfig;
  publicado: boolean;
}

export async function loadSite(slug: string): Promise<SiteRow | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("sites")
    .select("slug,tipo,nome,lead_id,config,publicado")
    .eq("slug", slug).eq("publicado", true).maybeSingle();
  if (!data) return null;
  return { ...data, config: data.config as SiteConfig };
}
