import Link from "next/link";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { InnerHeader } from "./inner-header";
import { publicPlanCards } from "@/lib/plans/server";
import { authReady } from "@/lib/auth/config";
import { getLocale, formatMoney, INTL_PRICES } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { AuthForm, type AuthMode } from "./auth-form";

export async function AccessPage({ login = false, mode, plan, next, state, email }: {
  login?: boolean; mode?: AuthMode; plan?: string; next?: string; state?: string; email?: string;
}) {
  const loc = await getLocale();
  const t = getMessages(loc.lang);
  const a = t.access;
  const selected = plan ? (await publicPlanCards()).plans.find((item) => item.slug === plan) : undefined;
  const activeMode = mode || (login ? "login" : "signup");
  const copy = {
    login: a.login,
    signup: a.signup,
    recover: a.recover,
    password: a.password,
    onboarding: a.onboarding,
  }[activeMode];
  const priceLabel = (slug: string, cents: number) => loc.isBrazil
    ? `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : formatMoney(INTL_PRICES[slug] ?? 0, loc.currency, loc.lang);
  return <div className="inner-page"><InnerHeader label={t.misc.backHome} /><main id="conteudo" className="container auth-layout">
    <div className="auth-story"><span className="eyebrow">{a.eyebrow}</span><h1>{a.storyT.split(". ").map((part, i, arr) => <span key={i}>{part}{i < arr.length - 1 ? ". " : ""}{i === arr.length - 2 ? <br /> : i === arr.length - 1 ? null : <br />}</span>)}</h1><p>{a.storyP}</p><ul className="check-list"><li><Check />{a.li1}</li><li><Check />{a.li2}</li><li><Check />{a.li3}</li></ul><div className="auth-story-note"><ShieldCheck size={21} /><span>{a.note}</span></div></div>
    <section className="auth-panel" aria-label={a.panelAria}><span className="eyebrow">{copy[0]}</span><h2>{copy[1]}</h2><p>{copy[2]}</p>
      {selected && <div className="selected-plan"><Sparkles size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 7 }} />{a.planInterest}: <strong>{selected.name}</strong> · {priceLabel(selected.slug, selected.priceCents)}{selected.slug !== "gratis" ? a.perMonth : ""}</div>}
      {state === "link-expirado" && <p className="auth-error" role="alert">{a.expired}</p>}
      {state === "perfil-pendente" && <p className="auth-error" role="alert">{a.pendingProfile}</p>}
      {(state === "oauth-falhou" || state === "oauth-indisponivel") && <p className="auth-error" role="alert">{t.auth.oauthErr}</p>}
      <AuthForm mode={activeMode} available={authReady()} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""} next={next} plan={selected?.slug} email={email} t={t.auth} />
      <Link className="auth-demo-link" href="/explorar">{a.demoLink}</Link>
    </section></main></div>;
}
