import { requireSession } from "@/lib/auth/session";
import { IntegrationsEditor } from "@/components/integrations-editor";

export default async function IntegrationsAdminPage() {
  const { supabase } = await requireSession("/admin/integracoes", { admin: true });
  const [secrets, settings, runs] = await Promise.all([
    supabase.rpc("list_integration_secrets"),
    supabase.from("app_settings").select("key,value"),
    supabase.rpc("list_search_runs"),
  ]);
  const provider = (settings.data ?? []).find((s) => s.key === "search_provider");
  const replay = (settings.data ?? []).find((s) => s.key === "search_replay");

  return <>
    <span className="eyebrow">INTEGRAÇÕES</span>
    <h1>Chaves e provedores<span className="gradient-text">.</span></h1>
    <p className="private-intro">Chaves ficam criptografadas no banco e são lidas pelas Edge Functions — nunca vão para o servidor web nem para o navegador.</p>
    {secrets.error ? <p role="alert" className="auth-error">Não foi possível carregar as integrações.</p> : (
      <IntegrationsEditor
        initialSecrets={secrets.data ?? []}
        initialProvider={provider?.value === "apify" ? "apify" : "google_places"}
        initialReplay={replay?.value === "on"}
        initialRuns={runs.data ?? []}
      />
    )}
  </>;
}
