import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "./supabase/admin";

// Catálogos globais — mesmo conteúdo pra todo usuário — que eram
// reconsultados em cada navegação privada. Cache de 2min: edições do
// admin propagam com leve atraso e cada request poupa um roundtrip.
export const getServicesCatalog = unstable_cache(
  async () => {
    const { data } = await createSupabaseAdminClient()
      .from("services_catalog").select("slug,nome,categoria,enabled_actions,ativo").order("nome");
    return data ?? [];
  },
  ["services-catalog"],
  { revalidate: 120 },
);

export const getCreditActionRules = unstable_cache(
  async () => {
    const { data } = await createSupabaseAdminClient()
      .from("credit_action_rules").select("action,cost,enabled").order("action");
    return data ?? [];
  },
  ["credit-action-rules"],
  { revalidate: 120 },
);
