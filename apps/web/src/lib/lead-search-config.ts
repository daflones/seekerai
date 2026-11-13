// Configuração da busca inteligente de leads (admin → /admin/busca).
// Compartilhada entre a API route, a página admin e o serviço de geração.
export interface LeadSearchConfig {
  targets: { default: number; essencial: number; pro: number; king: number };
  pool_multiplier: number;
  smart_filter: boolean;
  expand_rounds: number;
  expand_radius_km: number;
  fallback_site_ok: boolean;
  motivo?: string;
}

export const LEAD_SEARCH_DEFAULTS: LeadSearchConfig = {
  targets: { default: 20, essencial: 20, pro: 40, king: 60 },
  pool_multiplier: 2,
  smart_filter: true,
  expand_rounds: 2,
  expand_radius_km: 25,
  fallback_site_ok: true,
};
