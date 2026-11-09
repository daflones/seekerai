import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// status_detail devolvido pelo Mercado Pago → chave amigável.
// Referência: docs MP "mensagens de resposta" (cc_rejected_*, rejected_by_bank).
export function declineKey(statusDetail: string | null): string {
  switch (statusDetail) {
    case "cc_rejected_insufficient_amount":
      return "insufficient";
    case "cc_rejected_bad_filled_card_number":
    case "cc_rejected_bad_filled_date":
    case "cc_rejected_bad_filled_security_code":
    case "cc_rejected_bad_filled_other":
      return "badData";
    case "cc_rejected_call_for_authorize":
      return "authorize";
    case "cc_rejected_card_disabled":
      return "disabled";
    case "cc_rejected_duplicated_payment":
      return "duplicated";
    case "cc_rejected_high_risk":
    case "cc_rejected_blacklist":
      return "risk";
    case "cc_rejected_max_attempts":
      return "attempts";
    case "cc_rejected_card_type_not_allowed":
    case "cc_rejected_invalid_installments":
      return "notAllowed";
    case "rejected_by_bank":
      return "bank";
    default:
      return statusDetail ? "other" : "generic";
  }
}

// Motivo da recusa mais recente (últimas 24h) — alimenta o banner quando o
// usuário volta do checkout com ?checkout=cancelado.
export async function lastDeclineDetail(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase.from("payments")
    .select("metadata,created_at")
    .eq("user_id", userId).eq("status", "failed")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  if (Date.now() - new Date(data.created_at as string).getTime() > 24 * 3600_000) return null;
  const meta = data.metadata as Record<string, unknown> | null;
  return typeof meta?.mp_status_detail === "string" ? meta.mp_status_detail : null;
}
