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
  /** Idioma do site — derivado do país do lead na geração
      ("pt" | "en" | "es" | …). Ausente = "pt" (sites antigos). */
  lang?: string;
  /** ISO do país do estabelecimento ("BR", "US"…) — usado pra
      normalizar o WhatsApp sem assumir "+55". Ausente = "BR". */
  pais?: string;
  logo?: string;
  tagline?: string;
  cidade?: string;
  /** Paleta de cores do tema editorial — definida pela categoria do negócio
      (padaria, trattoria, clinica, studio, pet, flora, corporativo…).
      `variant` alterna a composição dos blocos; `cores` sobrepõe o accent
      com as cores dominantes das fotos reais do estabelecimento. */
  tema?: {
    accent?: string;
    paleta?: string;
    variant?: "a" | "b" | "c" | string;
    cores?: { accent: string; accent2: string };
  };
  /** Vocabulário por nicho — rótulos e textos do tema ("O estúdio", hero em…). */
  vocab?: {
    rotulo: string;
    em: string;
    desc: string;
    prep: string;
    marquee: string;
    ctaEm: string;
    schema: string;
    /** agendar = fluxo de horário; zap = WhatsApp; mapa = como chegar. */
    cta?: "agendar" | "zap" | "mapa";
    ctaLabel?: string;
    servicosLabel?: string;
    servicosTitle?: string;
    servicosEm?: string;
    servicosHint?: string;
    /** Título da seção de ofertas; quando definido e `ofertas` vier
        da IA (material promocional no IG), a seção aparece. */
    ofertasTitle?: string | null;
  };
  /** Promoções/campanhas detectadas no material do Instagram (mercado,
      restaurante, petshop…) — renderizadas como seção própria. */
  ofertas?: { titulo: string; texto?: string; tag?: string }[];
  contato: {
    telefone?: string;
    whatsapp?: string;
    instagram?: string;
    endereco?: string;
    mapsUrl?: string;
  };
  /** Horários por dia da semana (0=dom): lista de janelas [abre, fecha]. null = fechado. */
  horarios?: Record<string, [string, string][] | null>;
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
    itens?: { autor: string; nota?: number; texto: string; quando?: string; foto?: string }[];
    /** Print/depoimento real em imagem (ex.: recado de cliente no WhatsApp). */
    print?: string;
  };
  faq?: { q: string; a: string }[];
  /** Cards de dúvidas em imagem (ex.: carrossel de FAQ do Instagram).
      Se presente, substitui o acordeão por uma esteira de cards. */
  faqImagens?: string[];
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
