import { findService } from "./service-catalog";

export { services } from "./service-catalog";

export const nicheGroups: { label: string; niches: string[] }[] = [
  { label: "Beleza e bem-estar", niches: ["Barbearias", "Clínicas de estética", "Salões de beleza", "Estúdios de tatuagem"] },
  { label: "Comida e bebida", niches: ["Restaurantes", "Pizzarias", "Padarias", "Cafeterias", "Hamburguerias", "Buffets e eventos", "Açougues", "Mercados e mercearias"] },
  { label: "Saúde e corpo", niches: ["Academias", "Studios de pilates", "Personal trainers", "Nutricionistas", "Psicólogos", "Clínicas odontológicas", "Clínicas veterinárias", "Pet shops", "Farmácias", "Óticas"] },
  { label: "Negócios e serviços", niches: ["Imobiliárias", "Escritórios de contabilidade", "Advocacia", "Arquitetura e interiores", "Agências de viagem", "Assistência técnica de celular", "Informática e eletrônicos"] },
  { label: "Educação", niches: ["Escolas de idiomas", "Escolas particulares", "Autoescolas", "Cursos profissionalizantes"] },
  { label: "Automotivo", niches: ["Oficinas mecânicas", "Lava jatos", "Estética automotiva", "Borracharias"] },
  { label: "Comércio e varejo", niches: ["Lojas de roupas", "Lojas de calçados", "Joalherias", "Floriculturas", "Móveis e decoração"] },
  { label: "Construção e reformas", niches: ["Construção e reformas", "Elétrica e hidráulica", "Pintura e acabamento"] },
  { label: "Hospedagem", niches: ["Hotéis e pousadas"] },
];

export const niches = nicheGroups.flatMap((group) => group.niches);

export interface DemoCity {
  label: string;
  region: string;
  /** Base ilustrativa de estabelecimentos locais. */
  businesses: number;
}

export const cityGroups: { region: string; cities: DemoCity[] }[] = [
  { region: "Sudeste", cities: [
    { label: "São Paulo, SP", region: "Sudeste", businesses: 120000 },
    { label: "Campinas, SP", region: "Sudeste", businesses: 28000 },
    { label: "Ribeirão Preto, SP", region: "Sudeste", businesses: 19000 },
    { label: "São José dos Campos, SP", region: "Sudeste", businesses: 17000 },
    { label: "Santos, SP", region: "Sudeste", businesses: 12000 },
    { label: "Rio de Janeiro, RJ", region: "Sudeste", businesses: 86000 },
    { label: "Niterói, RJ", region: "Sudeste", businesses: 14000 },
    { label: "Belo Horizonte, MG", region: "Sudeste", businesses: 42000 },
    { label: "Uberlândia, MG", region: "Sudeste", businesses: 15000 },
    { label: "Vitória, ES", region: "Sudeste", businesses: 11000 },
  ] },
  { region: "Sul", cities: [
    { label: "Curitiba, PR", region: "Sul", businesses: 32000 },
    { label: "Londrina, PR", region: "Sul", businesses: 12000 },
    { label: "Florianópolis, SC", region: "Sul", businesses: 14000 },
    { label: "Joinville, SC", region: "Sul", businesses: 13000 },
    { label: "Porto Alegre, RS", region: "Sul", businesses: 30000 },
    { label: "Caxias do Sul, RS", region: "Sul", businesses: 11000 },
  ] },
  { region: "Nordeste", cities: [
    { label: "Salvador, BA", region: "Nordeste", businesses: 38000 },
    { label: "Fortaleza, CE", region: "Nordeste", businesses: 36000 },
    { label: "Recife, PE", region: "Nordeste", businesses: 28000 },
    { label: "Natal, RN", region: "Nordeste", businesses: 12000 },
    { label: "João Pessoa, PB", region: "Nordeste", businesses: 12000 },
    { label: "Maceió, AL", region: "Nordeste", businesses: 13000 },
    { label: "São Luís, MA", region: "Nordeste", businesses: 14000 },
    { label: "Teresina, PI", region: "Nordeste", businesses: 10000 },
  ] },
  { region: "Centro-Oeste", cities: [
    { label: "Brasília, DF", region: "Centro-Oeste", businesses: 34000 },
    { label: "Goiânia, GO", region: "Centro-Oeste", businesses: 21000 },
    { label: "Campo Grande, MS", region: "Centro-Oeste", businesses: 12000 },
    { label: "Cuiabá, MT", region: "Centro-Oeste", businesses: 10000 },
  ] },
  { region: "Norte", cities: [
    { label: "Manaus, AM", region: "Norte", businesses: 18000 },
    { label: "Belém, PA", region: "Norte", businesses: 15000 },
    { label: "Palmas, TO", region: "Norte", businesses: 6000 },
  ] },
];

export const cities = cityGroups.flatMap((group) => group.cities);

// Participação aproximada do nicho no comércio local (fração ilustrativa).
const nicheWeight: Record<string, number> = {
  Barbearias: 0.018, "Clínicas de estética": 0.012, "Salões de beleza": 0.02, "Estúdios de tatuagem": 0.006,
  Restaurantes: 0.032, Pizzarias: 0.01, Padarias: 0.008, Cafeterias: 0.006, Hamburguerias: 0.005,
  "Buffets e eventos": 0.004, "Açougues": 0.004, "Mercados e mercearias": 0.012,
  Academias: 0.012, "Studios de pilates": 0.006, "Personal trainers": 0.005, Nutricionistas: 0.004,
  "Psicólogos": 0.007, "Clínicas odontológicas": 0.014, "Clínicas veterinárias": 0.006,
  "Pet shops": 0.006, "Farmácias": 0.008, "Óticas": 0.003,
  "Imobiliárias": 0.01, "Escritórios de contabilidade": 0.008, Advocacia: 0.012,
  "Arquitetura e interiores": 0.004, "Agências de viagem": 0.003,
  "Assistência técnica de celular": 0.005, "Informática e eletrônicos": 0.005,
  "Escolas de idiomas": 0.003, "Escolas particulares": 0.004, Autoescolas: 0.003,
  "Cursos profissionalizantes": 0.004,
  "Oficinas mecânicas": 0.01, "Lava jatos": 0.004, "Estética automotiva": 0.003, Borracharias: 0.004,
  "Lojas de roupas": 0.014, "Lojas de calçados": 0.006, Joalherias: 0.003, Floriculturas: 0.003,
  "Móveis e decoração": 0.006,
  "Construção e reformas": 0.01, "Elétrica e hidráulica": 0.006, "Pintura e acabamento": 0.006,
  "Hotéis e pousadas": 0.006,
};

// Fração dos estabelecimentos do nicho que tipicamente precisa do serviço.
const serviceFit: Record<string, number> = {
  sites: 0.85, landing_pages: 0.8, ecommerce: 0.5, google_business: 0.8, seo: 0.7,
  automacao: 0.35, chatbots: 0.4,
  trafego: 0.55, social: 0.6, copywriting: 0.5, email_marketing: 0.4,
  gestao_whatsapp: 0.55, consultoria_marketing: 0.35,
  design: 0.6, branding: 0.55, fotografia: 0.45, gravacao_video: 0.4,
  edicao_video: 0.45, motion_design: 0.35, producao_conteudo: 0.5,
};

/** Estimativa numérica de leads potenciais: cidade × nicho × serviço. */
export function potentialEstimate(city: DemoCity, niche: string, service: string): number {
  return city.businesses * (nicheWeight[niche] ?? 0.008) * (serviceFit[service] ?? 0.5);
}

/** Estimativa ilustrativa de leads potenciais: cidade × nicho × serviço. */
export function formatPotential(city: DemoCity, niche: string, service: string): string {
  const estimate = potentialEstimate(city, niche, service);
  if (estimate >= 10_000) return `+${Math.round(estimate / 1000)} mil`;
  if (estimate >= 1_000) {
    const rounded = Math.round(estimate / 100) / 10;
    return `+${rounded.toLocaleString("pt-BR")} mil`;
  }
  return `+${Math.max(10, Math.round(estimate / 10) * 10)}`;
}

export type DemoLead = {
  id: string;
  name: string;
  category: string;
  initials: string;
  score: number;
  color: string;
  issue: string;
};

const names: Record<string, string[]> = {
  Barbearias: ["Barbearia Horizonte", "Studio do Barbeiro", "Barbearia Raiz"],
  "Clínicas de estética": ["Clínica Bem Viver", "Espaço Lumina", "Clínica Horizonte"],
  Restaurantes: ["Cozinha da Vila", "Bistrô Horizonte", "Casa do Sabor"],
  Academias: ["Movimento Studio", "Academia Horizonte", "Espaço Ativo"],
  "Pet shops": ["Pet da Vila", "Amigo de Patas", "Pet Horizonte"],
};

function fallbackNames(niche: string): string[] {
  const singular = niche.replace(/s$/, "");
  return [`${singular} Horizonte`, `Espaço ${singular.toLowerCase()}`, `${singular} da Vila`];
}

export function makeDemoLeads(niche: string, service: string): DemoLead[] {
  return (names[niche] ?? fallbackNames(niche)).map((name, i) => ({
    id: `demo-${i}`,
    name,
    category: niche,
    initials: name.split(" ").slice(0, 2).map((word) => word[0]).join(""),
    score: [96, 89, 84][i],
    color: ["violet", "cyan", "amber"][i],
    issue: service === "sites" ? "Sem site próprio" : findService(service)?.opportunity ?? "Sem site próprio",
  }));
}
