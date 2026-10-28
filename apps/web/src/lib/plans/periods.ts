// Períodos de cobrança do plano. Os mesmos fatores existem na edge
// billing-checkout — manter em sincronia com PERIODS de lá.
export type BillingPeriod = "mensal" | "trimestral" | "anual";

export interface PeriodDef {
  id: BillingPeriod;
  months: number;
  discountPct: number;
}

export const BILLING_PERIODS: PeriodDef[] = [
  { id: "mensal", months: 1, discountPct: 0 },
  { id: "trimestral", months: 3, discountPct: 10 },
  { id: "anual", months: 12, discountPct: 20 },
];

export function periodDef(id?: string | null): PeriodDef {
  return BILLING_PERIODS.find((p) => p.id === id) ?? BILLING_PERIODS[0];
}

/** Mensalidade equivalente com o desconto do período, em centavos. */
export function periodMonthlyCents(baseCents: number, period: PeriodDef): number {
  return Math.round(baseCents * (100 - period.discountPct) / 100);
}

/** Total cobrado no ciclo (mensalidade equivalente × meses). */
export function periodTotalCents(baseCents: number, period: PeriodDef): number {
  return periodMonthlyCents(baseCents, period) * period.months;
}
