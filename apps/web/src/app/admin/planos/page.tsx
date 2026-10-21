import { requireSession } from "@/lib/auth/session";
import { cardContentSchema, planSlug, type PlanCard } from "@/lib/plans/model";
import { defaultCardContent } from "@/lib/plans/preview";
import { PlanEditor } from "@/components/plan-editor";

export default async function PlanAdminPage() {
  const { supabase } = await requireSession("/admin/planos", { admin: true });
  const { data, error } = await supabase.from("plans")
    .select("id,slug,nome,preco_centavos,ordem,destaque,landing_visible,card_content,card_revision").order("ordem");
  const plans: PlanCard[] = [];
  for (const row of data || []) {
    const slug = planSlug.safeParse(row.slug);
    if (!slug.success) continue;
    const content = cardContentSchema.safeParse(row.card_content);
    if (!content.success && row.landing_visible) return <p role="alert">Um card publicado tem dados incompatíveis. Revise a configuração no banco antes de editar.</p>;
    plans.push({
      id: row.id, slug: slug.data, name: row.nome, priceCents: row.preco_centavos, order: row.ordem,
      featured: row.destaque, visible: row.landing_visible, revision: row.card_revision,
      content: content.success ? content.data : defaultCardContent(slug.data),
    });
  }
  return <>
    <span className="eyebrow">A OFERTA, DO SEU JEITO</span><h1>Planos e apresentação<span className="gradient-text">.</span></h1>
    <p className="private-intro">Configure o preço real do plano e a apresentação do card. A prévia usa o mesmo componente da landing.</p>
    {error ? <p role="alert" className="auth-error">Não foi possível carregar os planos.</p> : plans.length ? <PlanEditor initialPlans={plans} /> : <p className="auth-notice">Nenhum plano inicial foi provisionado. Execute o seed antes de editar.</p>}
  </>;
}
