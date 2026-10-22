"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ArrowUpRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { Turnstile } from "./turnstile";
import { getMessages, type Messages } from "@/lib/i18n/messages";

export type AuthMode = "login" | "signup" | "recover" | "password" | "onboarding";
type Fields = { email: string; password: string; confirmPassword: string; name: string; phone: string; terms: boolean; marketing: boolean };

export function AuthForm({ mode, available, siteKey, next, plan, email, t }: {
  mode: AuthMode; available: boolean; siteKey: string; next?: string; plan?: string; email?: string;
  t?: Messages["auth"];
}) {
  const tt = t ?? getMessages("pt").auth;
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
  const labels = { login: tt.loginBtn, signup: tt.signupBtn, recover: tt.recoverBtn, password: tt.passwordBtn, onboarding: tt.onboardingBtn };

  async function submit(fields: Fields) {
    setError("");
    if (!token || !available) { setError(tt.captchaFirst); return; }
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
      if (!response.ok) { setError(data.error || tt.errGeneric); return; }
      if (data.redirect) {
        const target = new URL(data.redirect, window.location.origin);
        if (target.origin !== window.location.origin) throw new Error("redirect");
        // A document navigation avoids stale RSC/session state after cookie mutations.
        window.location.replace(target.href);
      }
      else setMessage(data.message || tt.received);
    } catch { setError(tt.errConn); }
    finally { setToken(null); setEpoch((value) => value + 1); }
  }

  if (message) return <div className="auth-success" role="status"><CheckCircle2 size={30} /><h3>{tt.emailStep}</h3><p>{message}</p><Link href="/login" className="button button-primary">{tt.backLogin} <ArrowUpRight size={16} /></Link></div>;

  return <form className="auth-form" onSubmit={handleSubmit(submit)} aria-busy={isSubmitting}>
    {mode === "onboarding" && email && <p className="auth-account-email">{tt.account}: {email}</p>}
    {profileMode && <>
      <label htmlFor="auth-name">{tt.name}</label>
      <input id="auth-name" autoComplete="name" maxLength={150} aria-invalid={Boolean(errors.name)} {...register("name", { required: tt.nameReq, minLength: { value: 2, message: tt.nameMin } })} />
      {errors.name && <span className="field-error">{errors.name.message}</span>}
      <label htmlFor="auth-phone">{tt.phone}</label>
      <input id="auth-phone" type="tel" autoComplete="tel" maxLength={30} placeholder="(11) 99999-9999" aria-invalid={Boolean(errors.phone)} {...register("phone", { required: tt.phoneReq, validate: (value) => /^\+?[\d ()-]+$/.test(value) && value.replace(/\D/g, "").length >= 8 && value.replace(/\D/g, "").length <= 15 || tt.phoneInvalid })} />
      {errors.phone && <span className="field-error">{errors.phone.message}</span>}
    </>}
    {mode !== "password" && mode !== "onboarding" && <>
      <label htmlFor="auth-email">{tt.email}</label>
      <input id="auth-email" type="email" autoComplete="email" maxLength={254} required {...register("email", { required: true })} />
    </>}
    {passwordMode && <>
      <label htmlFor="auth-password">{mode === "password" ? tt.newPassword : tt.password}</label>
      <div className="password-field"><input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength={128}
        aria-invalid={Boolean(errors.password)} {...register("password", { required: tt.passReq, minLength: { value: mode === "login" ? 1 : 8, message: tt.passMin } })} />
        <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? tt.hidePass : tt.showPass}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
      {errors.password && <span className="field-error">{errors.password.message}</span>}
      {mode !== "login" && <><small className="auth-field-hint">{tt.passHint}</small><label htmlFor="auth-confirm">{tt.confirm}</label><input id="auth-confirm" type="password" autoComplete="new-password" maxLength={128} {...register("confirmPassword", { required: tt.confirmReq, validate: (value) => value === getValues("password") || tt.confirmMismatch })} />{errors.confirmPassword && <span className="field-error">{errors.confirmPassword.message}</span>}</>}
    </>}
    {mode === "login" && <Link href="/recuperar-senha" className="forgot-password">{tt.forgot}</Link>}
    {profileMode && <div className="auth-consents"><label><input type="checkbox" {...register("terms", { required: tt.termsReq })} /><span>{tt.termsPre} <Link href="/termos" target="_blank">{tt.termsLink}</Link> {tt.termsAnd} <Link href="/privacidade" target="_blank">{tt.privacyLink}</Link>.</span></label>{errors.terms && <span className="field-error">{errors.terms.message}</span>}<label><input type="checkbox" {...register("marketing")} /><span>{tt.marketing}</span></label></div>}
    {available ? <Turnstile siteKey={siteKey} action={mode} epoch={epoch} onToken={setToken} /> : <div className="auth-notice"><LockKeyhole size={17} /><span>{tt.waitConfig}</span></div>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="button button-primary" disabled={!available || !token || isSubmitting}>{isSubmitting ? <LoaderCircle size={16} className="spin" /> : <LockKeyhole size={15} />}{isSubmitting ? tt.wait : labels[mode]}<ArrowUpRight size={15} /></button>
    <p className="auth-secure-note">{tt.secureNote}</p>
    {mode === "login" && <p className="secondary-auth-link">{tt.noAccount} <Link href="/cadastro">{tt.createAccount}</Link></p>}
    {mode === "signup" && <p className="secondary-auth-link">{tt.hasAccount} <Link href="/login">{tt.signIn}</Link></p>}
    {mode === "recover" && <Link href="/login" className="secondary-auth-link">{tt.backLogin}</Link>}
  </form>;
}
