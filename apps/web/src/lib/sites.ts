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
  /** Foto real do estabelecimento casada ao serviço pela visão —
      vira card de destaque estilo "treatment" (foto + selo). */
  foto?: string | null;
  /** Selo curto do card ("MAIS PEDIDO", "MELHOR CUSTO") — só quando o
      material real sustenta (serviço mais citado, combo com desconto). */
  badge?: string | null;
  /** Preço "de" riscado — só preenchido quando a fonte real citar os
      dois valores (ex.: "de R$80 por R$68" numa legenda). */
  precoDe?: number | null;
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
    /** Sobreposição de cor — accent/accent2 vêm das fotos reais; na
        regeneração o esquema inteiro (superfícies+texto) vem girado no
        matiz pra "nova versão" sair com outra identidade visual. */
    cores?: {
      accent: string; accent2: string;
      accentInk?: string; espresso?: string;
      bg?: string; bg2?: string; panel?: string; panel2?: string;
      text?: string; muted?: string;
    };
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
  profissionais?: { nome: string; especialidade?: string; foto?: string; cargo?: string }[];
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
  /* Estúdio (tipo="custom"): HTML single-file gerado por IA. */
  html?: string;
  /** "web" | "mobile" — mobile renderiza em moldura de telefone. */
  target?: string;
  /** Dono do site (studio) — usado no gate de assinatura/trial. */
  owner?: string;
}

export interface SiteRow {
  slug: string;
  tipo: string;
  nome: string;
  lead_id: string | null;
  config: SiteConfig;
  publicado: boolean;
  owner_id?: string | null;
}

export async function loadSite(slug: string, opts: { raw?: boolean } = {}): Promise<SiteRow | null> {
  const admin = createSupabaseAdminClient();
  let query = admin.from("sites")
    .select("slug,tipo,nome,lead_id,config,publicado,created_at,sem_expiracao,owner_id")
    .eq("slug", slug);
  if (!opts.raw) query = query.eq("publicado", true);
  const { data } = await query.maybeSingle();
  if (!data) return null;

  // Trial de 7 dias do site de lead: expira na leitura quando o lead não
  // fechou — garante desativação mesmo sem cron rodando.
  const stale = Date.now() - new Date(data.created_at as string).getTime() > 7 * 86_400_000;
  if (!opts.raw && data.lead_id && stale && !data.sem_expiracao) {
    const { data: lead } = await admin.from("leads")
      .select("status").eq("id", data.lead_id).maybeSingle();
    if (lead?.status !== "ganho") {
      await admin.from("sites")
        .update({
          publicado: false,
          desativado_em: new Date().toISOString(),
          desativado_motivo: "expired",
        })
        .eq("slug", slug).eq("publicado", true);
      return null;
    }
  }
  return { ...data, config: data.config as SiteConfig };
}
