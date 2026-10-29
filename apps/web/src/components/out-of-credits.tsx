"use client";

import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";
import { getMessages } from "@/lib/i18n/messages";

// Erro vindo das edges quando a reserva de créditos falha por saldo.
export function isCreditsError(message: string): boolean {
  return /insufficient|cr[eé]ditos?\s+insuficientes/i.test(message);
}

// trial = usuário sem assinatura queimou os créditos de boas-vindas —
// a copy vira "Gostou? Assine!" e o CTA aponta pros planos (recarga
// avulsa só existe pra assinante).
export function OutOfCredits({ lang, trial = false }: { lang: string; trial?: boolean }) {
  const t = getMessages(lang as Parameters<typeof getMessages>[0]).common;
  return <div className="no-credits" role="alert">
    {trial ? <Sparkles size={18} /> : <Coins size={18} />}
    <div className="no-credits-body">
      <strong>{trial ? t.trialDoneT : t.noCreditsT}</strong>
      <p>{trial ? t.trialDoneP : t.noCreditsP}</p>
      <Link href={trial ? "/app/planos" : "/app/planos#creditos"} className="button button-primary button-small">
        <Coins size={14} />{trial ? t.trialDoneCta : t.noCreditsCta}
      </Link>
    </div>
  </div>;
}
