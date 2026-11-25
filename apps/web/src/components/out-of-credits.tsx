"use client";

import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";
import { getMessages } from "@/lib/i18n/messages";
import { PlanOffer } from "./plan-offer";

// Erro vindo das edges quando a reserva de créditos falha por saldo.
export function isCreditsError(message: string): boolean {
  return /insufficient|cr[eé]ditos?\s+insuficientes/i.test(message);
}

// trial = usuário sem assinatura. expired = a janela de 7 dias de
// créditos diários fechou — a copy deixa de prometer "volta amanhã"
// e vira só "assine pra continuar". Recarga avulsa é só de assinante.
export function OutOfCredits({ lang, trial = false, expired = false }: {
  lang: string; trial?: boolean; expired?: boolean;
}) {
  const t = getMessages(lang as Parameters<typeof getMessages>[0]).common;
  const ended = trial && expired;
  const href = trial ? "/app/planos" : "/app/planos#creditos";
  return <div className="no-credits" role="alert">
    {trial ? <Sparkles size={18} /> : <Coins size={18} />}
    <div className="no-credits-body">
      <strong>{ended ? t.trialExpT : trial ? t.trialDoneT : t.noCreditsT}</strong>
      <p>{ended ? t.trialExpP : trial ? t.trialDoneP : t.noCreditsP}</p>
      {/* Quem nunca assinou vê a oferta de planos aqui — o momento de
          tentar gerar site/mensagem sem saldo é o pico de intenção.
          Vale também pro trialExp ("ação é pra assinantes"): a oferta
          é exatamente a resposta pra essa mensagem. */}
      {trial && <PlanOffer lang={lang as Parameters<typeof getMessages>[0]} href={href} />}
      <Link href={href} className="button button-primary button-small">
        <Coins size={14} />{trial ? t.trialDoneCta : t.noCreditsCta}
      </Link>
    </div>
  </div>;
}
