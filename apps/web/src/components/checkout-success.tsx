"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Zap } from "lucide-react";
import type { Messages } from "@/lib/i18n/messages";

export interface BillingStatus {
  status: string | null;
  active: boolean;
  planSlug: string | null;
  planName: string | null;
  credits: number | null;
  saldo: number;
}

// Retorno do checkout de cartão: o provedor redireciona antes do webhook
// gravar a assinatura — a tela mostra "confirmando" e atualiza sozinha
// (plano + benefícios + saldo) assim que o webhook confirma.
export function CheckoutSuccess({ features, fallback, t }: {
  /** Benefícios por slug de plano, pra mostrar o que o usuário desbloqueou. */
  features: Record<string, string[]>;
  /** Aviso estático se a confirmação demorar além do polling. */
  fallback: string;
  t: Messages["common"];
}) {
  const router = useRouter();
  const [paid, setPaid] = useState<BillingStatus | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const refreshed = useRef(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    async function poll() {
      try {
        const res = await fetch("/api/billing-status", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as BillingStatus;
          // Confirma pelo pagamento recente, não só pela assinatura
          // ativa — quem faz upgrade já tem active=true antes de pagar.
          if (data.status === "paid" || (data.status === null && data.active)) {
            setPaid(data);
            if (!refreshed.current) { refreshed.current = true; router.refresh(); }
            return;
          }
        }
      } catch { /* tenta de novo */ }
      tries += 1;
      if (!stop && tries < 45) timer = setTimeout(() => void poll(), 4000);
      else if (!stop) setGaveUp(true);
    }
    void poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [router]);

  if (paid) {
    const feats = paid.planSlug ? (features[paid.planSlug] ?? []) : [];
    return <div className="paid-panel" role="status">
      <div className="paid-head">
        <CheckCircle2 size={22} className="paid-check" />
        <div>
          <strong>{t.paidT}{paid.planName ? ` — ${paid.planName}` : ""}</strong>
          <span>{t.paidP}</span>
        </div>
      </div>
      {paid.credits !== null && paid.credits > 0 && (
        <span className="paid-credits"><Zap size={13} />+{paid.credits} {t.paidCredits}</span>
      )}
      {feats.length > 0 && <ul className="paid-benefits">
        {feats.map((f) => <li key={f}><CheckCircle2 size={12} />{f}</li>)}
      </ul>}
      <Link href="/app/buscar" className="button button-primary button-small">{t.paidCta}</Link>
    </div>;
  }

  if (gaveUp) {
    return <p className="shell-notice" role="status">{fallback}</p>;
  }

  return <div className="pay-banner" role="status">
    <Loader2 size={18} className="spin pay-banner-icon" />
    <div className="pay-banner-text"><strong>{t.paidChecking}</strong></div>
  </div>;
}
