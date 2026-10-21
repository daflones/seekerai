"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ArrowUpRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { Turnstile } from "./turnstile";

export type AuthMode = "login" | "signup" | "recover" | "password" | "onboarding";
type Fields = { email: string; password: string; confirmPassword: string; name: string; phone: string; terms: boolean; marketing: boolean };

export function AuthForm({ mode, available, siteKey, next, plan, email }: {
  mode: AuthMode; available: boolean; siteKey: string; next?: string; plan?: string; email?: string;
}) {
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<Fields>({
    defaultValues: { email: email || "", terms: false, marketing: false },
  });
  const [token, setToken] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const profileMode = mode === "signup" || mode === "onboarding";
  const passwordMode = mode === "login" || mode === "signup" || mode === "password";
  const labels = { login: "Entrar na minha conta", signup: "Criar minha conta", recover: "Enviar instruções", password: "Atualizar senha", onboarding: "Concluir meu cadastro" };

  async function submit(fields: Fields) {
    setError("");
    if (!token || !available) { setError("Conclua a verificação de segurança antes de continuar."); return; }
    const body = {
      ...(mode !== "onboarding" && mode !== "password" ? { email: fields.email } : {}),
      ...(passwordMode ? { password: fields.password } : {}),
      ...(profileMode ? { name: fields.name, phone: fields.phone, terms: fields.terms, marketing: fields.marketing } : {}),
      ...(mode === "signup" && plan ? { plan } : {}),
      next, captchaToken: token,
    };
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Não foi possível concluir. Tente novamente."); return; }
      if (data.redirect) {
        const target = new URL(data.redirect, window.location.origin);
        if (target.origin !== window.location.origin) throw new Error("redirect");
        // A document navigation avoids stale RSC/session state after cookie mutations.
        window.location.replace(target.href);
      }
      else setMessage(data.message || "Solicitação recebida.");
    } catch { setError("Não foi possível conectar. Confira sua conexão e tente novamente."); }
    finally { setToken(null); setEpoch((value) => value + 1); }
  }

  if (message) return <div className="auth-success" role="status"><CheckCircle2 size={30} /><h3>Próximo passo: seu e-mail.</h3><p>{message}</p><Link href="/login" className="button button-primary">Voltar para entrar <ArrowUpRight size={16} /></Link></div>;

  return <form className="auth-form" onSubmit={handleSubmit(submit)} aria-busy={isSubmitting}>
    {mode === "onboarding" && email && <p className="auth-account-email">Conta: {email}</p>}
    {profileMode && <>
      <label htmlFor="auth-name">Seu nome</label>
      <input id="auth-name" autoComplete="name" maxLength={150} aria-invalid={Boolean(errors.name)} {...register("name", { required: "Informe seu nome.", minLength: { value: 2, message: "Use pelo menos 2 caracteres." } })} />
      {errors.name && <span className="field-error">{errors.name.message}</span>}
      <label htmlFor="auth-phone">Telefone</label>
      <input id="auth-phone" type="tel" autoComplete="tel" maxLength={30} placeholder="(11) 99999-9999" aria-invalid={Boolean(errors.phone)} {...register("phone", { required: "Informe seu telefone.", validate: (value) => /^\+?[\d ()-]+$/.test(value) && value.replace(/\D/g, "").length >= 8 && value.replace(/\D/g, "").length <= 15 || "Informe um telefone válido." })} />
      {errors.phone && <span className="field-error">{errors.phone.message}</span>}
    </>}
    {mode !== "password" && mode !== "onboarding" && <>
      <label htmlFor="auth-email">E-mail</label>
      <input id="auth-email" type="email" autoComplete="email" maxLength={254} required {...register("email", { required: true })} />
    </>}
    {passwordMode && <>
      <label htmlFor="auth-password">{mode === "password" ? "Nova senha" : "Senha"}</label>
      <div className="password-field"><input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength={128}
        aria-invalid={Boolean(errors.password)} {...register("password", { required: "Informe sua senha.", minLength: { value: mode === "login" ? 1 : 8, message: "Use pelo menos 8 caracteres." } })} />
        <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
      {errors.password && <span className="field-error">{errors.password.message}</span>}
      {mode !== "login" && <><small className="auth-field-hint">Pelo menos 8 caracteres. Prefira uma senha única.</small><label htmlFor="auth-confirm">Confirme a senha</label><input id="auth-confirm" type="password" autoComplete="new-password" maxLength={128} {...register("confirmPassword", { required: "Confirme sua senha.", validate: (value) => value === getValues("password") || "As senhas precisam ser iguais." })} />{errors.confirmPassword && <span className="field-error">{errors.confirmPassword.message}</span>}</>}
    </>}
    {mode === "login" && <Link href="/recuperar-senha" className="forgot-password">Esqueci minha senha</Link>}
    {profileMode && <div className="auth-consents"><label><input type="checkbox" {...register("terms", { required: "Aceite os termos para continuar." })} /><span>Li e aceito os <Link href="/termos" target="_blank">Termos de Uso</Link> e a <Link href="/privacidade" target="_blank">Política de Privacidade</Link>.</span></label>{errors.terms && <span className="field-error">{errors.terms.message}</span>}<label><input type="checkbox" {...register("marketing")} /><span>Quero receber novidades e comunicações do SeekerAi. Opcional.</span></label></div>}
    {available ? <Turnstile siteKey={siteKey} action={mode} epoch={epoch} onToken={setToken} /> : <div className="auth-notice"><LockKeyhole size={17} /><span>A autenticação aguarda provisionamento seguro no Supabase. O formulário não envia dados enquanto essa etapa estiver pendente.</span></div>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="button button-primary" disabled={!available || !token || isSubmitting}>{isSubmitting ? <LoaderCircle size={16} className="spin" /> : <LockKeyhole size={15} />}{isSubmitting ? "Aguarde..." : labels[mode]}<ArrowUpRight size={15} /></button>
    <p className="auth-secure-note">Protegido por Cloudflare Turnstile. Um novo token é usado a cada tentativa.</p>
    {mode === "login" && <p className="secondary-auth-link">Ainda não tem conta? <Link href="/cadastro">Criar minha conta</Link></p>}
    {mode === "signup" && <p className="secondary-auth-link">Já tem conta? <Link href="/login">Entrar</Link></p>}
    {mode === "recover" && <Link href="/login" className="secondary-auth-link">Voltar para entrar</Link>}
  </form>;
}
