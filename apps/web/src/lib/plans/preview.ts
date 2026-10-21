import type { CardContent, PlanCard } from "./model";

function feature(id: string, text: string, icon: "check" | "bot" | "sparkles" | "globe" = "check", highlight = false) {
  return { id, text, icon, highlight, visible: true };
}

export const previewPlanCards: PlanCard[] = [
  {
    id: null, slug: "gratis", name: "Grátis", priceCents: 0, order: 0, featured: false, visible: true, revision: 0,
    content: {
      badge: "SEU PRIMEIRO PASSO", theme: "cream", buttonStyle: "outline", cta: "Começar grátis",
      description: "Conheça o radar. Encontre o seu próximo ponto de partida.",
      features: [
        feature("radar", "Conheça o radar de negócios"),
        feature("oportunidades", "Sinais de oportunidade por serviço"),
        feature("abordagens", "Abordagens para iniciar conversas"),
        feature("portfolio", "Portfólio com até 3 trabalhos", "globe"),
        feature("sem-cartao", "Sem cartão de crédito"),
      ],
    },
  },
  {
    id: null, slug: "essencial", name: "Essencial", priceCents: 2490, order: 1, featured: false, visible: true, revision: 0,
    content: {
      badge: "PARA CRIAR CONSTÂNCIA", theme: "teal", buttonStyle: "solid", cta: "Escolher Essencial",
      description: "Para quem está começando a prospectar com mais direção.",
      features: [
        feature("leads", "Até 10 leads por busca"),
        feature("agente", "Agente de vendas com IA", "bot", true),
        feature("analise", "Análise de oportunidades por negócio"),
        feature("abordagem", "Abordagens adaptadas ao seu serviço"),
        feature("salvos", "Leads salvos para continuar a conversa"),
        feature("portfolio", "Portfólio sem a marca SeekerAi", "globe"),
      ],
    },
  },
  {
    id: null, slug: "pro", name: "Pro", priceCents: 4990, order: 2, featured: true, visible: true, revision: 0,
    content: {
      badge: "MAIS POPULAR", theme: "violet", buttonStyle: "light", cta: "Quero o SeekerAi Pro",
      description: "Para quem quer mais contexto em cada negociação.",
      features: [
        feature("leads", "Até 30 leads por busca"),
        feature("essencial", "Tudo do plano Essencial"),
        feature("agente", "Agente de vendas com IA", "bot", true),
        feature("estrategias", "Estratégias aprofundadas por negócio", "sparkles"),
        feature("copiloto", "Copiloto para apoiar suas chamadas"),
        feature("historico", "Histórico das suas conversas"),
        feature("portfolio", "Todos os modelos de portfólio", "globe"),
      ],
    },
  },
  {
    id: null, slug: "king", name: "King", priceCents: 6490, order: 3, featured: false, visible: true, revision: 0,
    content: {
      badge: "SEU PRÓXIMO NÍVEL", theme: "gold", buttonStyle: "solid", cta: "Escolher King",
      description: "Para quem prospecta com frequência e quer ir além.",
      features: [
        feature("leads", "Até 50 leads por busca"),
        feature("pro", "Tudo do plano Pro"),
        feature("agente", "Agente de vendas com IA", "bot", true),
        feature("capacidade", "Mais capacidade para sua prospecção", "sparkles"),
        feature("portfolio", "Trabalhos ilimitados no portfólio", "globe"),
        feature("presenca", "Sua presença profissional, sem a marca"),
      ],
    },
  },
];

export function defaultCardContent(slug: string): CardContent {
  return structuredClone((previewPlanCards.find((plan) => plan.slug === slug) || previewPlanCards[0]).content);
}
