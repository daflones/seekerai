"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { getMessages } from "@/lib/i18n/messages";

// Erro vindo das edges quando a reserva de créditos falha por saldo.
export function isCreditsError(message: string): boolean {
  return /insufficient|cr[eé]ditos?\s+insuficientes/i.test(message);
}

export function OutOfCredits({ lang }: { lang: string }) {
  const t = getMessages(lang as Parameters<typeof getMessages>[0]).common;
  return <div className="no-credits" role="alert">
    <Coins size={18} />
    <div className="no-credits-body">
      <strong>{t.noCreditsT}</strong>
      <p>{t.noCreditsP}</p>
      <Link href="/app/planos#creditos" className="button button-primary button-small">
        <Coins size={14} />{t.noCreditsCta}
      </Link>
    </div>
  </div>;
}
