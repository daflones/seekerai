"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Crown, CreditCard, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { plans } from "@/lib/catalog";

export function Pricing() {
  const [method, setMethod] = useState("pix");
  return (
    <section id="planos" className="section pricing-section">
      <div className="section-heading centered"><span className="eyebrow">UM PLANO PARA CADA MOMENTO</span><h2>Pequeno investimento.<br /><span className="muted-heading">Novas possibilidades.</span></h2><p>Comece conhecendo. Cresça quando fizer sentido para você.</p></div>
      <div className="payment-toggle" role="group" aria-label="Forma de pagamento">{[["pix", "PIX"], ["card", "Cartão"]].map(([id, label]) => <button key={id} aria-pressed={method === id} onClick={() => setMethod(id)}>{id === "pix" ? <QrCode size={15} /> : <CreditCard size={15} />}{label}</button>)}</div>
      <div className="plans-grid">{plans.map((plan) => <article key={plan.id} className={`plan-card plan-${plan.id}`}><span className="plan-tag">{plan.id === "king" ? <Crown size={12} /> : plan.id === "pro" ? <Sparkles size={12} /> : null}{plan.tag}</span><h3>{plan.name}</h3><p className="plan-description">{plan.description}</p><div className="plan-price"><span>R$</span>{plan.price}<small>{plan.id === "gratis" ? "/ teste" : "/ mês"}</small></div><Link href={`/cadastro?plano=${plan.id}&metodo=${method}`} className={`button ${plan.id === "pro" ? "button-primary" : "button-outline"}`}>{plan.cta}<ArrowUpRight size={15} /></Link><span className="plan-divider" /><ul>{plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul></article>)}</div>
      <p className="pricing-note"><ShieldCheck size={15} /> Oferta planejada para o lançamento. Pagamentos ainda não habilitados.</p>
      <p className="pricing-detail">{method === "pix" ? "PIX: acesso pré-pago por 30 dias. Sem renovação automática." : "Cartão: assinatura mensal. Cancelamento sem fidelidade."} Nenhuma cobrança nesta demonstração.</p>
    </section>
  );
}
