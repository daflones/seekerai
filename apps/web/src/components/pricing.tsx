"use client";

import { useState } from "react";
import { CreditCard, QrCode, ShieldCheck } from "lucide-react";
import type { PlanCard, PlanSource } from "@/lib/plans/model";
import { PlanCardView } from "./plan-card";

export function Pricing({ plans, source }: { plans: PlanCard[]; source: PlanSource }) {
  const [method, setMethod] = useState("pix");
  return (
    <section id="planos" className="section pricing-section">
      <div className="section-heading centered"><span className="eyebrow">DA PRIMEIRA CONVERSA AO PRÓXIMO NÍVEL</span><h2>Seu talento já está aí.<br /><span className="muted-heading">Escolha como ir além.</span></h2><p>Encontre oportunidades. Chegue com contexto.<br />Tenha a IA do seu lado na hora de conversar.</p></div>
      <div className="payment-toggle" role="group" aria-label="Forma de pagamento">{[["pix", "PIX"], ["card", "Cartão"]].map(([id, label]) => <button key={id} aria-pressed={method === id} onClick={() => setMethod(id)}>{id === "pix" ? <QrCode size={15} /> : <CreditCard size={15} />}{label}</button>)}</div>
      {plans.length > 0 ? <div className="plans-grid">{plans.map((plan) => <PlanCardView key={plan.slug} plan={plan} method={method} />)}</div>
        : <div className="plans-unavailable" role="status">{source === "unavailable" ? "Não foi possível carregar os planos agora. Tente novamente em instantes." : "Estamos preparando os próximos planos. Volte em breve."}</div>}
      <p className="pricing-note"><ShieldCheck size={15} />{source === "preview" ? "Valores demonstrativos. A publicação dos planos aguarda configuração do admin." : "Planos de lançamento. Recursos em implantação e pagamentos ainda não habilitados."}</p>
      <p className="pricing-detail">{method === "pix" ? "PIX: acesso pré-pago por 30 dias. Sem renovação automática." : "Cartão: assinatura mensal. Cancelamento sem fidelidade."} Nenhuma cobrança nesta demonstração.</p>
    </section>
  );
}
