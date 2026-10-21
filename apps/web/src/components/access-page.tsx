import Link from "next/link";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { InnerHeader } from "./inner-header";
import { publicPlanCards } from "@/lib/plans/server";
import { formatPlanPrice } from "@/lib/plans/model";
import { authReady } from "@/lib/auth/config";
import { AuthForm, type AuthMode } from "./auth-form";

export async function AccessPage({ login = false, mode, plan, next, state, email }: {
  login?: boolean; mode?: AuthMode; plan?: string; next?: string; state?: string; email?: string;
}) {
  const selected = plan ? (await publicPlanCards()).plans.find((item) => item.slug === plan) : undefined;
  const activeMode = mode || (login ? "login" : "signup");
  const copy = {
    login: ["BOM TER VOCÊ DE VOLTA", "Entre no seu radar.", "Suas oportunidades e próximos passos, em um só lugar."],
    signup: ["SEU PRÓXIMO PASSO", "Crie sua conta.", "Comece a construir novas possibilidades para o seu negócio."],
    recover: ["VAMOS RESOLVER", "Recupere seu acesso.", "Enviaremos as instruções para o e-mail da sua conta."],
    password: ["UM NOVO COMEÇO", "Escolha uma nova senha.", "Use uma senha única para proteger seu próximo passo."],
    onboarding: ["FALTA POUCO", "Complete sua chegada.", "Confirme seus dados e o aceite para acessar a plataforma."],
  }[activeMode];
  return <div className="inner-page"><InnerHeader /><main id="conteudo" className="container auth-layout">
    <div className="auth-story"><span className="eyebrow">SEU PRÓXIMO PASSO COMEÇA AQUI</span><h1>Mais direção.<br />Mais boas conversas.<br /><span className="gradient-text">Novas possibilidades.</span></h1><p>Seu talento já existe. Estamos construindo uma forma melhor de conectar você às empresas que precisam dele.</p><ul className="check-list"><li><Check />Prospecção com contexto</li><li><Check />Uma abordagem mais humana</li><li><Check />Seu trabalho no centro da conversa</li></ul><div className="auth-story-note"><ShieldCheck size={21} /><span>Seus dados ficam protegidos com criptografia e verificação no servidor. Você está seguro com a gente.</span></div></div>
    <section className="auth-panel" aria-label="Acesso à conta"><span className="eyebrow">{copy[0]}</span><h2>{copy[1]}</h2><p>{copy[2]}</p>
      {selected && <div className="selected-plan"><Sparkles size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 7 }} />Plano de interesse: <strong>{selected.name}</strong> · R$ {formatPlanPrice(selected.priceCents)}{selected.slug !== "gratis" ? "/mês" : ""}</div>}
      {state === "link-expirado" && <p className="auth-error" role="alert">Este link expirou ou já foi utilizado. Solicite outro link de recuperação.</p>}
      {state === "perfil-pendente" && <p className="auth-error" role="alert">O perfil da sua conta ainda não está disponível. O provisionamento do banco precisa ser concluído.</p>}
      <AuthForm mode={activeMode} available={authReady()} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""} next={next} plan={selected?.slug} email={email} />
      <Link className="auth-demo-link" href="/explorar">Prefere conhecer primeiro? Explore a demonstração.</Link>
    </section></main></div>;
}
