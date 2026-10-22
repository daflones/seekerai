import { Code2, ImageIcon, MessageCircle, Sparkles } from "lucide-react";
import { configuredCost, previewCreditRules } from "@/lib/billing/action-policy";
import { supportsAction } from "@/lib/service-catalog";
import { getMessages, type Messages } from "@/lib/i18n/messages";

type ToolsT = Messages["demo"]["tools"];

export function BusinessToolsPreview({ service, t }: { service: string; t?: ToolsT }) {
  const tt = t ?? getMessages("pt").demo.tools;
  const tools = [
    ...(supportsAction(service, "generate_site") ? [{ action: "generate_site" as const, label: tt.site, icon: Code2 }] : []),
    ...(supportsAction(service, "generate_image") ? [{ action: "generate_image" as const, label: tt.image, icon: ImageIcon }] : []),
    { action: "deep_strategy" as const, label: tt.strategy, icon: Sparkles },
    { action: "sales_reply" as const, label: tt.conv, icon: MessageCircle },
  ];
  return <section className="business-tools-preview" aria-label={tt.aria}>
    <h3>{tt.title}</h3>
    <p>{tt.note}</p>
    <div className="business-tools-grid">{tools.map(({ action, label, icon: Icon }) => {
      const cost = configuredCost(previewCreditRules[action]);
      return <button key={action} disabled><span><Icon size={16} />{label}</span><small>{cost === null ? tt.costSet : `${cost} ${tt.costEach}`}</small></button>;
    })}</div>
    {supportsAction(service, "generate_site") && <p className="tool-context-note">{tt.siteNote}</p>}
  </section>;
}
