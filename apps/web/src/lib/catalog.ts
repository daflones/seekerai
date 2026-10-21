import { findService } from "./service-catalog";

export { services } from "./service-catalog";

export const niches = ["Barbearias", "Clínicas", "Restaurantes", "Academias", "Pet shops"] as const;
export const cities = ["São Paulo, SP", "Curitiba, PR", "Belo Horizonte, MG", "Rio de Janeiro, RJ", "Florianópolis, SC"] as const;

export const plans = [
  { id: "gratis", name: "Grátis", price: "0", description: "Para conhecer seu próximo passo.", tag: "SEU PONTO DE PARTIDA", features: ["Conheça o radar de negócios", "Análise de oportunidades", "Abordagens para WhatsApp", "Portfólio com até 3 trabalhos"], cta: "Começar grátis" },
  { id: "essencial", name: "Essencial", price: "24,90", description: "Para tirar a prospecção do papel.", tag: "CRIE CONSTÂNCIA", features: ["Prospecção para a sua rotina", "Até 10 leads por busca", "Leads salvos e organização", "Portfólio sem a marca SeekerAi"], cta: "Escolher Essencial" },
  { id: "pro", name: "Pro", price: "49,90", description: "Para transformar conversa em venda.", tag: "MAIS POPULAR", features: ["Mais espaço para prospectar", "Até 30 leads por busca", "Agente de vendas com IA", "Copiloto de chamadas", "Todos os modelos de portfólio"], cta: "Quero o SeekerAi Pro" },
  { id: "king", name: "King", price: "64,90", description: "Para quem quer ir mais longe.", tag: "MÁXIMA POTÊNCIA", features: ["Seu ritmo de prospecção ampliado", "Até 50 leads por busca", "Tudo do plano Pro", "Mais capacidade de prospecção", "Portfólio com trabalhos ilimitados"], cta: "Escolher King" },
] as const;

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
  Clínicas: ["Clínica Bem Viver", "Espaço Saúde", "Clínica Horizonte"],
  Restaurantes: ["Cozinha da Vila", "Bistrô Horizonte", "Casa do Sabor"],
  Academias: ["Movimento Studio", "Academia Horizonte", "Espaço Ativo"],
  "Pet shops": ["Pet da Vila", "Amigo de Patas", "Pet Horizonte"],
};

export function makeDemoLeads(niche: string, service: string): DemoLead[] {
  return (names[niche] ?? names.Barbearias).map((name, i) => ({
    id: `demo-${i}`,
    name,
    category: niche,
    initials: name.split(" ").slice(0, 2).map((word) => word[0]).join(""),
    score: [96, 89, 84][i],
    color: ["violet", "cyan", "amber"][i],
    issue: service === "sites" ? "Sem site próprio" : findService(service)?.opportunity ?? "Sem site próprio",
  }));
}
