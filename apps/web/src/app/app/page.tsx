import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, Compass, ShieldCheck } from "lucide-react";
import { requireSession } from "@/lib/auth/session";

export default async function AppPage() {
  const { supabase, user, profile } = await requireSession();
  const { data: wallet, error } = await supabase.from("credit_wallets").select("saldo").eq("user_id", user.id).single();
  return <>
    <span className="eyebrow">SEU ESPAÇO DE NOVAS POSSIBILIDADES</span>
    <h1>Bem-vindo, {profile.nome || "vamos começar"}<span className="gradient-text">.</span></h1>
    <p className="private-intro">Sua conta está protegida. Agora vamos preparar seus próximos passos.</p>
    <div className="private-cards">
      <section><CircleDollarSign size={24} /><span>SEUS CRÉDITOS</span><h2>{error || !wallet ? "Indisponível" : wallet.saldo}</h2><p>Saldo real da sua carteira. As regras de uso ficam aqui dentro da plataforma.</p></section>
      <section><ShieldCheck size={24} /><span>SUA CONTA</span><h2>Acesso verificado</h2><p>E-mail confirmado, sessão via Supabase e perfil separado dos demais usuários.</p></section>
      <section><Compass size={24} /><span>CONHEÇA O FLUXO</span><h2>Seu novo radar</h2><p>A busca real e as ferramentas de geração ainda estão em construção.</p><Link href="/explorar" className="text-link">Abrir demonstração <ArrowUpRight size={15} /></Link></section>
    </div>
    <p className="private-disclaimer">Nenhuma busca paga ou geração de IA é executada nesta tela.</p>
  </>;
}
