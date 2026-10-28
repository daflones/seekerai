import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { authReady } from "@/lib/auth/config";
import { allowedOrigin, callbackOrigin, loginSchema, onboardingSchema, passwordSchema, recoverySchema, safeNext, signupSchema } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { verifyAuthenticatedCaptcha } from "@/lib/auth/turnstile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function reply(body: object, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

function authError(code?: string) {
  if (code === "captcha_failed") return reply({ error: "A verificação de segurança expirou ou falhou. Tente novamente." }, 400);
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
    return reply({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, 429, { "Retry-After": "60" });
  }
  return reply({ error: "Não foi possível concluir. Confira os dados e, se necessário, confirme seu e-mail." }, 400);
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  if (!allowedOrigin(request.headers.get("origin"))) return reply({ error: "Origem da solicitação não permitida." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Formato inválido." }, 415);
  const { action } = await context.params;
  if (!["login", "signup", "recover", "password", "onboarding", "logout"].includes(action)) return reply({ error: "Ação não encontrada." }, 404);
  if (!authReady() && action !== "logout") return reply({ error: "A autenticação aguarda configuração segura do servidor. Tente novamente mais tarde." }, 503);
  try {
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 16_384) { await reader.cancel(); return reply({ error: "Solicitação muito grande." }, 413); }
        text += decoder.decode(chunk.value, { stream: true });
      }
    }
    text += decoder.decode();
    let body: unknown;
    try { body = JSON.parse(text); } catch { return reply({ error: "Solicitação inválida." }, 400); }
    const origin = request.headers.get("origin")!;
    const supabase = await createSupabaseServerClient();

    if (action === "login") {
      const input = loginSchema.parse(body);
      const limit = await authRateLimit(action, input.email, request.headers);
      if (!limit.allowed) return reply({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, 429, { "Retry-After": String(limit.retryAfter) });
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email, password: input.password, options: { captchaToken: input.captchaToken },
      });
      if (error || !data.user?.email_confirmed_at) return authError(error?.code);
      const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("role,consentimento_em,onboarding_concluido").eq("id", data.user.id).single();
      if (profileError || !profile) return reply({ error: "Conta autenticada, mas o perfil aguarda provisionamento. Contate o suporte." }, 503);
      let next = safeNext(input.next);
      if (profile.role === "admin" && next === "/app") next = "/admin";
      if (profile.role !== "admin" && (next === "/admin" || next.startsWith("/admin/"))) next = "/app";
      if (!profile.consentimento_em || !profile.onboarding_concluido) next = `/completar-cadastro?next=${encodeURIComponent(next)}`;
      return reply({ redirect: next });
    }

    if (action === "signup") {
      const input = signupSchema.parse(body);
      const limit = await authRateLimit(action, input.email, request.headers);
      if (!limit.allowed) return reply({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, 429, { "Retry-After": String(limit.retryAfter) });
      const next = input.plan ? `/app?plano=${input.plan}` : "/app";
      const { data, error } = await supabase.auth.signUp({
        email: input.email, password: input.password,
        options: {
          captchaToken: input.captchaToken,
          emailRedirectTo: `${callbackOrigin(origin)}/auth/callback?next=${encodeURIComponent(next)}`,
          data: { full_name: input.name },
        },
      });
      if (error && !["user_already_exists", "email_exists"].includes(error.code || "")) return authError(error.code);
      if (data.user?.identities?.length) {
        const admin = createSupabaseAdminClient();
        const { error: consentError } = await admin.rpc("record_registration_consent", {
          p_user: data.user.id, p_name: input.name, p_phone: input.phone, p_marketing: input.marketing,
        });
        if (consentError) {
          return reply({ message: "Confira seu e-mail para continuar. Após entrar, você poderá concluir os dados e o aceite da conta." });
        }
      }
      // Com confirmação de e-mail desligada, o signUp já devolve sessão
      // (cookies gravados pelo client SSR) — entra direto no app.
      if (data.session) return reply({ redirect: next });
      return reply({ message: "Se o cadastro puder ser concluído, você receberá um e-mail de confirmação. Confira também a pasta de spam." });
    }

    if (action === "recover") {
      const input = recoverySchema.parse(body);
      const limit = await authRateLimit(action, input.email, request.headers);
      if (!limit.allowed) return reply({ error: "Aguarde antes de solicitar outro link." }, 429, { "Retry-After": String(limit.retryAfter) });
      const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
        captchaToken: input.captchaToken,
        redirectTo: `${callbackOrigin(origin)}/auth/callback?recovery=1`,
      });
      if (error?.code === "captcha_failed") return authError(error.code);
      // Do not expose whether the address has an account.
      return reply({ message: "Se houver uma conta para esse e-mail, você receberá as instruções de recuperação." });
    }

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email_confirmed_at) return reply({ error: "Sua sessão expirou. Entre novamente." }, 401);
    if (action === "logout") {
      const { error: logoutError } = await supabase.auth.signOut({ scope: "local" });
      return logoutError ? reply({ error: "Não foi possível encerrar a sessão. Tente novamente." }, 503) : reply({ redirect: "/login" });
    }

    const input = action === "password" ? passwordSchema.parse(body) : onboardingSchema.parse(body);
    const limit = await authRateLimit(action, user.id, request.headers);
    if (!limit.allowed) return reply({ error: "Aguarde antes de tentar novamente." }, 429, { "Retry-After": String(limit.retryAfter) });
    if (!await verifyAuthenticatedCaptcha(input.captchaToken, action, origin)) return authError("captcha_failed");
    if ("password" in input) {
      const { error: passwordError } = await supabase.auth.updateUser({ password: input.password });
      if (passwordError) return authError(passwordError.code);
      return reply({ redirect: "/app", message: "Senha atualizada." });
    }
    const { error: profileError } = await supabase.rpc("complete_own_profile", {
      p_name: input.name, p_phone: input.phone, p_accept_terms: input.terms, p_marketing: input.marketing,
    });
    if (profileError) return reply({ error: "Não foi possível concluir o perfil. Tente novamente." }, 503);
    return reply({ redirect: safeNext(input.next) });
  } catch (error) {
    if (error instanceof ZodError) return reply({ error: error.issues[0]?.message || "Confira os dados informados." }, 400);
    return reply({ error: "Serviço temporariamente indisponível. Nenhuma informação sensível foi registrada." }, 503);
  }
}
