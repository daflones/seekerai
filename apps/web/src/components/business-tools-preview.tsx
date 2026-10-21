import { Code2, ImageIcon, MessageCircle, Sparkles } from "lucide-react";
import { configuredCost, previewCreditRules } from "@/lib/billing/action-policy";
import { supportsAction } from "@/lib/service-catalog";

export function BusinessToolsPreview({ service }: { service: string }) {
  const tools = [
    ...(supportsAction(service, "generate_site") ? [{ action: "generate_site" as const, label: "Criar site", icon: Code2 }] : []),
    ...(supportsAction(service, "generate_image") ? [{ action: "generate_image" as const, label: "Criar imagem", icon: ImageIcon }] : []),
    { action: "deep_strategy" as const, label: "Aprofundar estratégia", icon: Sparkles },
    { action: "sales_reply" as const, label: "IA para a conversa", icon: MessageCircle },
  ];
  return <section className="business-tools-preview" aria-label="Prévia das ferramentas por estabelecimento">
    <h3>Ferramentas para este negócio</h3>
    <p>Prévia dos valores-base. Nenhuma ação de geração está conectada e nenhum crédito é debitado nesta demonstração.</p>
    <div className="business-tools-grid">{tools.map(({ action, label, icon: Icon }) => {
      const cost = configuredCost(previewCreditRules[action]);
      return <button key={action} disabled><span><Icon size={16} />{label}</span><small>{cost === null ? "Custo a configurar no admin" : `${cost} créditos por estabelecimento`}</small></button>;
    })}</div>
    {supportsAction(service, "generate_site") && <p className="tool-context-note">Já tem site? Primeiro será necessário analisá-lo e identificar melhorias fundamentadas. A proposta pode ser de modernização, não apenas de um site novo.</p>}
  </section>;
}
