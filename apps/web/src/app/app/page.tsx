import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CircleDollarSign, Compass, Images, Radar, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import { requireSession } from "@/lib/auth/session";

const ACTION_LABELS: Record<string, string> = {
  search: "Busca de oportunidades",
  generate_site: "Site gerado com IA",
  generate_image: "Imagem gerada",
  deep_strategy: "Estratégia aprofundada",
  sales_reply: "Mensagem de abordagem",
  whatsapp_check: "Verificação de WhatsApp",
};

const ACTION_STATUS: Record<string, string> = {
  completed: "concluída",
  reserved: "reservada",
  refunded: "estornada",
};

export default async function AppPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const params = await searchParams;
  const { supabase, user, profile } = await requireSession();
  if (!profile.onboarding_visto_em) redirect("/boas-vindas");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ data: wallet }, { count: leadsTotal }, { count: leadsNovos }, { data: subs }, { data: ops }] = await Promise.all([
    supabase.from("credit_wallets").select("saldo").eq("user_id", user.id).maybeSingle(),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "novo"),
    supabase.from("subscriptions").select("status").eq("user_id", user.id)
      .in("status", ["active", "past_due"]).limit(1),
    supabase.from("credit_operations").select("action,cost,status,created_at")
      .eq("status", "completed").order("created_at", { ascending: false }).limit(30),
  ]);

  const operacoes = ops ?? [];
  const buscas = operacoes.filter((o) => o.action === "search").length;
  const gastoMes = operacoes.filter((o) => new Date(o.created_at) >= monthStart)
    .reduce((acc, o) => acc + o.cost, 0);
  const porAcao = Object.entries(
    operacoes.reduce<Record<string, number>>((acc, o) => {
      acc[o.action] = (acc[o.action] ?? 0) + o.cost;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const assinatura = subs?.length ? "ativa" : null;

  return <>
    {params.checkout === "sucesso" && (
      <p className="shell-notice" role="status">Pagamento confirmado — quando o provedor concluir, seus créditos entram sozinhos.</p>
    )}
    <span className="eyebrow">SEU RADAR DE VENDAS</span>
    <h1>Bem-vindo, {profile.nome || "vamos começar"}<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Encontre estabelecimentos que precisam do que você vende, salve os leads e deixe a IA preparar a abordagem.
    </p>

    <div className="stat-grid">
      <section className="stat-card">
        <span className="stat-icon"><CircleDollarSign size={18} /></span>
        <small>CRÉDITOS DISPONÍVEIS</small>
        <strong>{wallet?.saldo ?? 0}</strong>
        <span className="stat-sub">{assinatura ? "Assinatura ativa — créditos renovam todo mês" : "Sem assinatura — assine para buscar"}</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><Users size={18} /></span>
        <small>LEADS NO PIPELINE</small>
        <strong>{leadsTotal ?? 0}</strong>
        <span className="stat-sub">{leadsNovos ? `${leadsNovos} ainda não contatado${leadsNovos === 1 ? "" : "s"}` : "Nenhum lead aguardando contato"}</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><Radar size={18} /></span>
        <small>BUSCAS REALIZADAS</small>
        <strong>{buscas}</strong>
        <span className="stat-sub">Varreduras concluídas do radar</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><TrendingUp size={18} /></span>
        <small>CRÉDITOS USADOS NO MÊS</small>
        <strong>{gastoMes}</strong>
        <span className="stat-sub">Consumo de IA e busca desde dia 1º</span>
      </section>
    </div>

    <div className="dash-grid">
      <section className="dash-panel">
        <h2><Sparkles size={16} /> Resumo de operações</h2>
        {porAcao.length === 0
          ? <p className="dash-empty">Nenhuma operação ainda. Sua primeira busca aparece aqui com o custo de cada ação.</p>
          : <>
              <ul className="dash-usage">
                {porAcao.map(([action, total]) => (
                  <li key={action}>
                    <span>{ACTION_LABELS[action] ?? action}</span>
                    <strong>{total} crédito{total === 1 ? "" : "s"}</strong>
                  </li>
                ))}
              </ul>
              <ul className="dash-ops">
                {operacoes.slice(0, 6).map((o, i) => (
                  <li key={`${o.created_at}-${i}`}>
                    <span>{ACTION_LABELS[o.action] ?? o.action}</span>
                    <span className="dash-op-meta">
                      {o.cost} cr · {ACTION_STATUS[o.status] ?? o.status} · {new Date(o.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            </>}
      </section>

      <section className="dash-panel">
        <h2><Compass size={16} /> Próximos passos</h2>
        <ul className="dash-actions">
          <li><Link href="/app/buscar"><Radar size={16} /><div><strong>Rodar o radar</strong><small>Nicho + cidade → estabelecimentos com sinais de oportunidade</small></div><ArrowUpRight size={15} /></Link></li>
          <li><Link href="/app/leads"><Users size={16} /><div><strong>Trabalhar o pipeline</strong><small>Mensagem, estratégia e site com IA por lead</small></div><ArrowUpRight size={15} /></Link></li>
          <li><Link href="/app/portfolio"><Images size={16} /><div><strong>Montar seu portfólio</strong><small>Página que vai junto com cada abordagem</small></div><ArrowUpRight size={15} /></Link></li>
          {!assinatura && <li><Link href="/app/planos"><CircleDollarSign size={16} /><div><strong>Assinar um plano</strong><small>Desbloqueie a busca e créditos mensais</small></div><ArrowUpRight size={15} /></Link></li>}
        </ul>
      </section>
    </div>

    <p className="private-disclaimer">
      <ShieldCheck size={13} /> Buscas e gerações consomem créditos conforme a regra de cada ação.
    </p>
  </>;
}
