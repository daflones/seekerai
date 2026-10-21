import { KeyRound } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { IntegrationsEditor } from "@/components/integrations-editor";
import { edgeSecretNames, secretsStatus } from "@/lib/admin/edge-secrets";

const FONTE_LABEL: Record<string, string> = {
  supabase: "Supabase (edge secrets)",
  painel: "Painel (banco criptografado)",
  ausente: "Não configurada",
};

export default async function IntegrationsAdminPage() {
  const { supabase } = await requireSession("/admin/integracoes", { admin: true });
  const [secrets, settings, runs, edge] = await Promise.all([
    supabase.rpc("list_integration_secrets"),
    supabase.from("app_settings").select("key,value"),
    supabase.rpc("list_search_runs"),
    edgeSecretNames(),
  ]);
  const provider = (settings.data ?? []).find((s) => s.key === "search_provider");
  const replay = (settings.data ?? []).find((s) => s.key === "search_replay");
  const status = secretsStatus(edge, (secrets.data ?? []).map((s: { nome: string }) => s.nome));

  return <>
    <span className="eyebrow">INTEGRAÇÕES</span>
    <h1>Chaves e provedores<span className="gradient-text">.</span></h1>
    <p className="private-intro">Chaves ficam criptografadas no banco ou como secrets das Edge Functions — nunca vão para o servidor web nem para o navegador.</p>

    <section className="dash-panel secrets-status">
      <h2><KeyRound size={16} /> Onde cada chave está configurada</h2>
      <p className="dash-hint">
        {edge === null
          ? "Leitura do Supabase indisponível: defina SUPABASE_ACCESS_TOKEN no servidor para detectar os edge secrets. Enquanto isso, só o painel é verificado."
          : "Verificação ao vivo dos secrets do projeto Supabase combinada com o que está salvo no painel."}
      </p>
      <ul className="secrets-list">
        {status.map((s) => (
          <li key={s.nome}>
            <code>{s.nome}</code>
            <span className={`secret-fonte secret-${s.fonte}`}>{FONTE_LABEL[s.fonte]}</span>
          </li>
        ))}
      </ul>
    </section>

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
