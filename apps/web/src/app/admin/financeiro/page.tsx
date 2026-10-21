import type { Metadata } from "next";
import { AdminFinanceiro } from "@/components/admin-financeiro";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Financeiro", robots: { index: false } };

export default function AdminFinanceiroPage() {
  return <>
    <span className="eyebrow">FINANCEIRO</span>
    <h1>Rendimentos e saques<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Receita separada por provedor, previsão pelas assinaturas ativas e saque PIX
      do saldo MercosulPay.
    </p>
    <AdminFinanceiro />
  </>;
}
