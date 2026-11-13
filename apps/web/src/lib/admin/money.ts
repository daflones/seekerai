// Totais financeiros por moeda — pagamentos guardam a moeda real em
// payments.currency (com fallback pro metadata das linhas antigas).
// Nunca some moedas diferentes: cada uma tem sua própria chave.

export type PayCurrency = "brl" | "usd" | "eur" | "gbp";
export const PAY_CURRENCIES = ["brl", "usd", "eur", "gbp"] as const;
export type CurTotals = Record<PayCurrency, number>;

export const emptyTotals = (): CurTotals => ({ brl: 0, usd: 0, eur: 0, gbp: 0 });

export const CUR_LABEL: Record<PayCurrency, string> = {
  brl: "R$", usd: "US$", eur: "€", gbp: "£",
};

/** Moeda do pagamento: coluna currency > metadata.currency (legado) > brl. */
export function payCurrency(p: { currency?: string | null; metadata?: unknown }): PayCurrency {
  const direct = (p.currency ?? "").toLowerCase();
  if (direct === "usd" || direct === "eur" || direct === "gbp" || direct === "brl") return direct;
  const meta = p.metadata as Record<string, unknown> | null;
  const mc = typeof meta?.currency === "string" ? meta.currency.toLowerCase() : "";
  if (mc === "usd" || mc === "eur" || mc === "gbp" || mc === "brl") return mc;
  return "brl";
}

export function addCents(totals: CurTotals, currency: PayCurrency, cents: number) {
  totals[currency] += cents;
}

export function fmtMoney(cents: number, currency: PayCurrency): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency", currency: currency.toUpperCase(),
  });
}

/** "R$ 1.234,56 · US$ 45,00 · € 30,00" — só as moedas com movimento. */
export function fmtTotals(totals: CurTotals): string {
  const parts = PAY_CURRENCIES.filter((c) => totals[c] !== 0).map((c) => fmtMoney(totals[c], c));
  return parts.length ? parts.join(" · ") : fmtMoney(0, "brl");
}

/** Versão em unidades (reais) — pro contrato da API de saque. */
export function totalsToUnits(totals: CurTotals): Record<PayCurrency, number> {
  return {
    brl: totals.brl / 100, usd: totals.usd / 100,
    eur: totals.eur / 100, gbp: totals.gbp / 100,
  };
}

export function unitsToTotals(units: Partial<Record<PayCurrency, number>>): CurTotals {
  const t = emptyTotals();
  for (const c of PAY_CURRENCIES) t[c] = Math.round((units[c] ?? 0) * 100);
  return t;
}
