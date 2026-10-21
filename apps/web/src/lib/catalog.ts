import { findService } from "./service-catalog";

export { services } from "./service-catalog";

export const niches = ["Barbearias", "Clínicas", "Restaurantes", "Academias", "Pet shops"] as const;
export const cities = ["São Paulo, SP", "Curitiba, PR", "Belo Horizonte, MG", "Rio de Janeiro, RJ", "Florianópolis, SC"] as const;

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
