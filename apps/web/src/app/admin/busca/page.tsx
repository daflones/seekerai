import { requireSession } from "@/lib/auth/session";
import { AdminSearch } from "@/components/admin-search";
import { LEAD_SEARCH_DEFAULTS, type LeadSearchConfig } from "@/lib/lead-search-config";

export default async function AdminSearchPage() {
  const { supabase } = await requireSession("/admin/busca", { admin: true });
  const { data } = await supabase.from("app_settings")
    .select("value").eq("key", "lead_search").maybeSingle();
  const raw = (data?.value ?? {}) as Record<string, unknown>;
  const config = { ...LEAD_SEARCH_DEFAULTS, ...raw } as LeadSearchConfig;

  return <>
    <span className="eyebrow">RADAR DE OPORTUNIDADES</span>
    <h1>Busca de leads<span className="gradient-text">.</span></h1>
    <p className="page-sub">Como o radar qualifica e expande a busca de estabelecimentos por plano.</p>
    <AdminSearch initial={config} />
  </>;
}
