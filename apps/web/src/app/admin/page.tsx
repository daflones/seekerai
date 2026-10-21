import { LockKeyhole, Settings2, ShieldCheck } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { authReady } from "@/lib/auth/config";

export default async function AdminPage() {
  const { supabase } = await requireSession("/admin", { admin: true });
  const [{ count }, { data: settings }, { data: rules, error: rulesError }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("credit_settings").select("welcome_credits").single(),
    supabase.from("credit_action_rules").select("action,cost,enabled").order("action"),
  ]);
  const labels: Record<string, string> = { search: "Busca", generate_site: "Criação de site", generate_image: "Criação de imagem", deep_strategy: "Estratégia aprofundada", sales_reply: "IA para conversas" };
  return <>
    <span className="eyebrow">CONTROLE COM RESPONSABILIDADE</span><h1>Painel administrativo<span className="gradient-text">.</span></h1>
    <p className="private-intro">Este acesso é autorizado por sessão e role consultados no servidor.</p>
    <div className="private-cards"><section><ShieldCheck size={24} /><span>CONTAS CADASTRADAS</span><h2>{count ?? "Indisponível"}</h2><p>Contagem real de perfis visíveis ao administrador.</p></section><section><Settings2 size={24} /><span>BÔNUS DE CADASTRO</span><h2>{settings?.welcome_credits ?? "Indisponível"}</h2><p>Créditos de boas-vindas configurados no banco.</p></section><section><LockKeyhole size={24} /><span>AUTENTICAÇÃO</span><h2>{authReady() ? "Configurada" : "Pendente"}</h2><p>Supabase SSR e Cloudflare Turnstile. Nenhuma chave secreta é enviada a este painel.</p></section></div>
    <section className="admin-section"><h2>Regras de créditos</h2><p>Consulta da configuração atual. A edição administrativa será conectada na próxima etapa às RPCs auditadas.</p>
      {rulesError ? <p role="alert">Não foi possível carregar as regras.</p> : <div className="admin-table-wrap"><table><thead><tr><th>Ação</th><th>Custo</th><th>Estado</th></tr></thead><tbody>{rules?.map((rule) => <tr key={rule.action}><td>{labels[rule.action] || rule.action}</td><td>{rule.cost === null ? "A definir" : `${rule.cost} créditos`}</td><td>{rule.enabled ? "Habilitada na regra" : "Desabilitada"}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
