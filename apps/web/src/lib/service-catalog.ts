export type ServiceAction = "generate_site" | "generate_image";

export type ServiceDefinition = {
  id: string;
  label: string;
  category: "Web e tecnologia" | "Marketing e vendas" | "Design e audiovisual";
  opportunity: string;
  actions: readonly ServiceAction[];
};

export const services = [
  { id: "sites", label: "Criação de sites", category: "Web e tecnologia", opportunity: "Site ausente ou a modernizar", actions: ["generate_site"] },
  { id: "landing_pages", label: "Landing pages", category: "Web e tecnologia", opportunity: "Página de conversão a desenvolver", actions: ["generate_site"] },
  { id: "ecommerce", label: "Lojas virtuais e e-commerce", category: "Web e tecnologia", opportunity: "Venda online a estruturar", actions: ["generate_site", "generate_image"] },
  { id: "automacao", label: "Automação de processos", category: "Web e tecnologia", opportunity: "Atendimento a automatizar", actions: [] },
  { id: "chatbots", label: "Chatbots e agentes de IA", category: "Web e tecnologia", opportunity: "Atendimento com IA a explorar", actions: [] },
  { id: "trafego", label: "Tráfego pago", category: "Marketing e vendas", opportunity: "Aquisição digital a explorar", actions: ["generate_image"] },
  { id: "social", label: "Gestão de redes sociais", category: "Marketing e vendas", opportunity: "Presença social a desenvolver", actions: ["generate_image"] },
  { id: "seo", label: "SEO e busca orgânica", category: "Marketing e vendas", opportunity: "Visibilidade orgânica a analisar", actions: [] },
  { id: "google_business", label: "Perfil da Empresa no Google", category: "Marketing e vendas", opportunity: "Presença no Google a otimizar", actions: [] },
  { id: "copywriting", label: "Copywriting e textos de venda", category: "Marketing e vendas", opportunity: "Comunicação comercial a revisar", actions: [] },
  { id: "email_marketing", label: "E-mail marketing e CRM", category: "Marketing e vendas", opportunity: "Relacionamento com clientes a estruturar", actions: [] },
  { id: "gestao_whatsapp", label: "Atendimento e vendas no WhatsApp", category: "Marketing e vendas", opportunity: "Jornada de atendimento a melhorar", actions: [] },
  { id: "consultoria_marketing", label: "Consultoria de marketing", category: "Marketing e vendas", opportunity: "Estratégia de marketing a aprofundar", actions: [] },
  { id: "design", label: "Design gráfico", category: "Design e audiovisual", opportunity: "Materiais visuais a desenvolver", actions: ["generate_image"] },
  { id: "branding", label: "Branding e identidade visual", category: "Design e audiovisual", opportunity: "Identidade visual a desenvolver", actions: ["generate_image"] },
  { id: "edicao_video", label: "Edição de vídeo", category: "Design e audiovisual", opportunity: "Conteúdo em vídeo a aprimorar", actions: ["generate_image"] },
  { id: "gravacao_video", label: "Gravação e produção de vídeo", category: "Design e audiovisual", opportunity: "Produção audiovisual a explorar", actions: ["generate_image"] },
  { id: "fotografia", label: "Fotografia comercial", category: "Design e audiovisual", opportunity: "Fotografia profissional a avaliar", actions: ["generate_image"] },
  { id: "motion_design", label: "Motion design e animação", category: "Design e audiovisual", opportunity: "Comunicação em movimento a explorar", actions: ["generate_image"] },
  { id: "producao_conteudo", label: "Produção de conteúdo e UGC", category: "Design e audiovisual", opportunity: "Conteúdo de marca a planejar", actions: ["generate_image"] },
] as const satisfies readonly ServiceDefinition[];

export const serviceCategories: readonly ServiceDefinition["category"][] = [
  "Web e tecnologia", "Marketing e vendas", "Design e audiovisual",
];

export function findService(id: string): ServiceDefinition | undefined {
  return services.find((service) => service.id === id);
}

export function supportsAction(serviceId: string, action: ServiceAction): boolean {
  return findService(serviceId)?.actions.includes(action) ?? false;
}
