import "server-only";
import { supabasePublicConfig } from "@/lib/auth/config";

// Dispara o agente de IA do suporte sem bloquear a resposta ao usuário.
// A edge é protegida por INTERNAL_CRON_SECRET — chamada best-effort.
export function triggerSupportAgent(ticketId: string): void {
  const config = supabasePublicConfig();
  const internalKey = process.env.INTERNAL_CRON_SECRET;
  if (!config || !internalKey) return;
  void fetch(`${config.url}/functions/v1/support-agent`, {
    method: "POST",
    headers: {
      "x-internal-key": internalKey,
      apikey: config.key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ticketId }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => { /* o sweep do cron recupera chamados não respondidos */ });
}
