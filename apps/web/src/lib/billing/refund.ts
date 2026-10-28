import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Estorno tolerante para rotas orquestradoras: a edge devolve os créditos
// quando ela mesma falha, mas pode morrer antes (timeout, deploy, crash).
// Nesse caso a rota que marca o job como erro chama esta função — a RPC
// só devolve se a operação ainda estiver 'reserved', nunca desfaz uma
// operação concluída nem duplica um estorno.
export async function refundCreditAction(
  admin: SupabaseClient,
  userId: string,
  requestRef: string | null | undefined,
): Promise<void> {
  if (!requestRef) return;
  await admin.rpc("refund_credit_action", {
    p_user: userId,
    p_request_ref: requestRef,
  }).then(() => {}, () => {});
}
