import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, Compass, ShieldCheck, Users } from "lucide-react";
import { requireSession } from "@/lib/auth/session";

export default async function AppPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const params = await searchParams;
  const { supabase, user, profile } = await requireSession();
  const [{ data: wallet }, { count: leadsTotal }, { count: leadsNovos }, { data: subs }] = await Promise.all([
    supabase.from("credit_wallets").select("saldo").eq("user_id", user.id).maybeSingle(),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "novo"),
    supabase.from("subscriptions").select("status").eq("user_id", user.id)
      .in("status", ["active", "past_due"]).limit(1),
  ]);

  return <>
    <span className="eyebrow">SEU RADAR DE VENDAS</span>
    <h1>Bem-vindo, {profile.nome || "vamos começar"}<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      {params.checkout === "sucesso"
        ? "Pagamento confirmado — quando o provedor concluir, seus créditos entram sozinhos."
        : "Encontre estabelecimentos que precisam do que você vende, salve os leads e deixe a IA preparar a abordagem."}
    </p>
    <div className="private-cards">
      <section><Compass size={24} /><span>PRÓXIMA OPORTUNIDADE</span>
        <h2>Rodar o radar</h2>
        <p>Busque por nicho e cidade. Salve quem tem sinal de oportunidade — sem site, poucas avaliações, presença fraca.</p>
        <Link href="/app/buscar" className="text-link">Buscar agora <ArrowUpRight size={15} /></Link></section>
      <section><Users size={24} /><span>PIPELINE</span>
        <h2>{leadsTotal ?? 0} lead{(leadsTotal ?? 0) === 1 ? "" : "s"}</h2>
        <p>{leadsNovos ? `${leadsNovos} ainda não contatado${leadsNovos === 1 ? "" : "s"}. ` : ""}
          Abra um lead para gerar mensagem, estratégia ou site com IA.</p>
        <Link href="/app/leads" className="text-link">Ver pipeline <ArrowUpRight size={15} /></Link></section>
      <section><CircleDollarSign size={24} /><span>SEUS CRÉDITOS</span>
        <h2>{wallet?.saldo ?? "—"}</h2>
        <p>{subs?.length
          ? "Assinatura ativa — os créditos do plano entram a cada ciclo."
          : "Créditos da sua carteira. Assine um plano para receber todo mês."}</p>
        <Link href="/app/planos" className="text-link">Ver planos <ArrowUpRight size={15} /></Link></section>
    </div>
    <p className="private-disclaimer">
      <ShieldCheck size={13} /> Buscas e gerações consomem créditos conforme a regra de cada ação.
    </p>
  </>;
}
