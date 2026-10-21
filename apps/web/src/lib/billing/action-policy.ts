import { supportsAction } from "../service-catalog";

export type CreditAction = "search" | "generate_image" | "generate_site" | "deep_strategy" | "sales_reply";
export type CreditRule = { cost: number | null; enabled: boolean };
export type CreditRules = Record<CreditAction, CreditRule>;

// Display-only fixtures. Production must read the database, never trust these as authorization.
export const previewCreditRules: CreditRules = {
  search: { cost: 4, enabled: true },
  generate_image: { cost: 2, enabled: true },
  generate_site: { cost: 5, enabled: true },
  deep_strategy: { cost: null, enabled: false },
  sales_reply: { cost: null, enabled: false },
};

export type WebsiteAssessment =
  | { state: "missing"; url: null; evidence: readonly string[] }
  | { state: "not_analyzed" | "current"; url: string; evidence: readonly string[] }
  | { state: "improvable"; url: string; evidence: readonly string[] };

export function siteProposalMode(service: string, assessment: WebsiteAssessment): "new" | "redesign" | null {
  if (!supportsAction(service, "generate_site")) return null;
  if (assessment.state === "missing") return "new";
  if (assessment.state === "improvable" && assessment.evidence.some((finding) => finding.trim().length > 0)) return "redesign";
  return null;
}

export function configuredCost(rule: CreditRule): number | null {
  return rule.enabled && rule.cost !== null && Number.isSafeInteger(rule.cost) && rule.cost > 0 ? rule.cost : null;
}
