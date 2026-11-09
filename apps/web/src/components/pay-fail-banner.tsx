import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { declineKey } from "@/lib/payments/decline";

// Banner de pagamento recusado — mostra o motivo reportado pelo provedor
// (Mercado Pago) quando disponível, senão mensagem genérica + CTA.
export function PayFailBanner({ detail, t }: {
  detail: string | null;
  t: { payFailT: string; payFailReasons: Record<string, string>; payFailCta: string };
}) {
  const reason = t.payFailReasons[declineKey(detail)] ?? t.payFailReasons.generic;
  return (
    <div className="pay-banner pay-banner-error" role="alert">
      <CircleAlert size={18} className="pay-banner-icon" />
      <div className="pay-banner-text">
        <strong>{t.payFailT}</strong>
        <span>{reason}</span>
      </div>
      <Link href="/app/planos" className="button button-primary button-small">{t.payFailCta}</Link>
    </div>
  );
}
