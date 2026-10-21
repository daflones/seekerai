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
  /** Estimativa ilustrativa de estabelecimentos no radar. */
  potential: string;
}

export const cityGroups: { region: string; cities: DemoCity[] }[] = [
  { region: "Sudeste", cities: [
    { label: "São Paulo, SP", region: "Sudeste", potential: "+120 mil" },
    { label: "Campinas, SP", region: "Sudeste", potential: "+28 mil" },
    { label: "Ribeirão Preto, SP", region: "Sudeste", potential: "+19 mil" },
    { label: "São José dos Campos, SP", region: "Sudeste", potential: "+17 mil" },
    { label: "Santos, SP", region: "Sudeste", potential: "+12 mil" },
    { label: "Rio de Janeiro, RJ", region: "Sudeste", potential: "+86 mil" },
    { label: "Niterói, RJ", region: "Sudeste", potential: "+14 mil" },
    { label: "Belo Horizonte, MG", region: "Sudeste", potential: "+42 mil" },
    { label: "Uberlândia, MG", region: "Sudeste", potential: "+15 mil" },
    { label: "Vitória, ES", region: "Sudeste", potential: "+11 mil" },
  ] },
  { region: "Sul", cities: [
    { label: "Curitiba, PR", region: "Sul", potential: "+32 mil" },
    { label: "Londrina, PR", region: "Sul", potential: "+12 mil" },
    { label: "Florianópolis, SC", region: "Sul", potential: "+14 mil" },
    { label: "Joinville, SC", region: "Sul", potential: "+13 mil" },
    { label: "Porto Alegre, RS", region: "Sul", potential: "+30 mil" },
    { label: "Caxias do Sul, RS", region: "Sul", potential: "+11 mil" },
  ] },
  { region: "Nordeste", cities: [
    { label: "Salvador, BA", region: "Nordeste", potential: "+38 mil" },
    { label: "Fortaleza, CE", region: "Nordeste", potential: "+36 mil" },
    { label: "Recife, PE", region: "Nordeste", potential: "+28 mil" },
    { label: "Natal, RN", region: "Nordeste", potential: "+12 mil" },
    { label: "João Pessoa, PB", region: "Nordeste", potential: "+12 mil" },
    { label: "Maceió, AL", region: "Nordeste", potential: "+13 mil" },
    { label: "São Luís, MA", region: "Nordeste", potential: "+14 mil" },
    { label: "Teresina, PI", region: "Nordeste", potential: "+10 mil" },
  ] },
  { region: "Centro-Oeste", cities: [
    { label: "Brasília, DF", region: "Centro-Oeste", potential: "+34 mil" },
    { label: "Goiânia, GO", region: "Centro-Oeste", potential: "+21 mil" },
    { label: "Campo Grande, MS", region: "Centro-Oeste", potential: "+12 mil" },
    { label: "Cuiabá, MT", region: "Centro-Oeste", potential: "+10 mil" },
  ] },
  { region: "Norte", cities: [
    { label: "Manaus, AM", region: "Norte", potential: "+18 mil" },
    { label: "Belém, PA", region: "Norte", potential: "+15 mil" },
    { label: "Palmas, TO", region: "Norte", potential: "+6 mil" },
  ] },
];

export const cities = cityGroups.flatMap((group) => group.cities);

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
