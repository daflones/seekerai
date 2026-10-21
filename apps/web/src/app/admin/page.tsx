import Link from "next/link";
import { ArrowUpRight, Compass, CreditCard, Headset, LockKeyhole, Settings2, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { authReady } from "@/lib/auth/config";

const ACTION_LABELS: Record<string, string> = {
  search: "Busca",
  generate_site: "Criação de site",
  generate_image: "Criação de imagem",
  deep_strategy: "Estratégia aprofundada",
  sales_reply: "IA para conversas",
  whatsapp_check: "Verificação de WhatsApp",
};

export default async function AdminPage() {
  const { supabase } = await requireSession("/admin", { admin: true });
  const [
    { count: usuarios },
    { data: settings },
    { data: rules },
    { data: subs },
    { count: leadsCount },
    { data: ops },
    { count: ticketsAbertos },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("credit_settings").select("welcome_credits").single(),
    supabase.from("credit_action_rules").select("action,cost,enabled").order("action"),
    supabase.from("subscriptions").select("status, plans(preco_centavos)").eq("status", "active"),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("credit_operations").select("action,cost,status").eq("status", "completed").limit(5000),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "aberto"),
  ]);

  const ativas = subs?.length ?? 0;
  const mrr = (subs ?? []).reduce((acc, s) => {
    const plano = s.plans as unknown as { preco_centavos: number } | null;
    return acc + (plano?.preco_centavos ?? 0);
  }, 0) / 100;
  const creditosUsados = (ops ?? []).reduce((acc, o) => acc + o.cost, 0);
  const buscas = (ops ?? []).filter((o) => o.action === "search").length;
  const porAcao = Object.entries(
    (ops ?? []).reduce<Record<string, number>>((acc, o) => {
      acc[o.action] = (acc[o.action] ?? 0) + o.cost;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return <>
    <span className="eyebrow">CONTROLE COM RESPONSABILIDADE</span>
    <h1>Painel administrativo<span className="gradient-text">.</span></h1>
    <p className="private-intro">Visão geral da operação. Acesso autorizado por sessão e role no servidor.</p>

    <div className="stat-grid">
      <section className="stat-card"><span className="stat-icon"><Users size={18} /></span>
        <small>USUÁRIOS</small><strong>{usuarios ?? "—"}</strong>
        <span className="stat-sub">Contas cadastradas</span></section>
      <section className="stat-card"><span className="stat-icon"><CreditCard size={18} /></span>
        <small>ASSINATURAS ATIVAS</small><strong>{ativas}</strong>
        <span className="stat-sub">MRR estimado: {mrr.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></section>
      <section className="stat-card"><span className="stat-icon"><Compass size={18} /></span>
        <small>BUSCAS EXECUTADAS</small><strong>{buscas}</strong>
        <span className="stat-sub">{leadsCount ?? 0} leads salvos no total</span></section>
      <section className="stat-card"><span className="stat-icon"><TrendingUp size={18} /></span>
        <small>CRÉDITOS CONSUMIDOS</small><strong>{creditosUsados}</strong>
        <span className="stat-sub">Operações concluídas de IA e busca</span></section>
      <section className="stat-card"><span className="stat-icon"><Headset size={18} /></span>
        <small>CHAMADOS ABERTOS</small><strong>{ticketsAbertos ?? 0}</strong>
        <span className="stat-sub">Suporte aguardando resposta</span></section>
      <section className="stat-card"><span className="stat-icon"><LockKeyhole size={18} /></span>
        <small>AUTENTICAÇÃO</small><strong>{authReady() ? "Ativa" : "Pendente"}</strong>
        <span className="stat-sub">Supabase SSR + Turnstile</span></section>
    </div>

    <div className="dash-grid">
      <section className="dash-panel">
        <h2><TrendingUp size={16} /> Consumo por ação</h2>
        {porAcao.length === 0
          ? <p className="dash-empty">Nenhuma operação registrada ainda.</p>
          : <ul className="dash-usage">
              {porAcao.map(([action, total]) => (
                <li key={action}><span>{ACTION_LABELS[action] ?? action}</span><strong>{total} créditos</strong></li>
              ))}
            </ul>}
        <div className="dash-links">
          <Link href="/admin/planos" className="text-link">Editar cards de plano <ArrowUpRight size={13} /></Link>
          <Link href="/admin/integracoes" className="text-link">Integrações e secrets <ArrowUpRight size={13} /></Link>
        </div>
      </section>
      <section className="dash-panel">
        <h2><Settings2 size={16} /> Regras de créditos</h2>
        <p className="dash-hint">Bônus de cadastro: <strong>{settings?.welcome_credits ?? "—"} créditos</strong></p>
        <ul className="dash-usage">
          {rules?.map((rule) => (
            <li key={rule.action}>
              <span>{ACTION_LABELS[rule.action] ?? rule.action}</span>
              <strong>{rule.enabled ? (rule.cost === 0 ? "grátis" : `${rule.cost} cr`) : "desabilitada"}</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>

    <p className="private-disclaimer"><ShieldCheck size={13} /> Nenhuma chave secreta é exibida neste painel — só origem e estado.</p>
  </>;
}
