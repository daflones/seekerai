import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "../supabase/server";
import { supabasePublicConfig } from "./config";
import { readAccessToken, verifyAccessToken } from "./jwt";
import { safeNext } from "./validation";

export const verifiedSession = cache(async () => {
  if (!supabasePublicConfig()) return null;
  const supabase = await createSupabaseServerClient();
  // Lê o access token do cookie e confere a assinatura localmente — só
  // chama a Auth API (getUser) como fallback. Sem getSession() aqui: além
  // do warning de segurança por request, ele podia disparar refresh
  // concorrente fora do middleware.
  const { cookies: readCookies } = await import("next/headers");
  const store = await readCookies();
  const token = readAccessToken(store.getAll());
  let user: { id: string; email?: string; email_confirmed_at?: string } | null = null;
  let accessToken: string | null = null;
  if (token) {
    const claims = await verifyAccessToken(token);
    if (claims?.sub) {
      user = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
      accessToken = token;
    }
  }
  if (!token) return null; // sem token no cookie, getUser sempre 401 — evita o roundtrip
  if (!user) {
    try {
      const { data: { user: checked }, error } = await supabase.auth.getUser();
      if (error || !checked || !checked.email_confirmed_at) return null;
      user = checked;
      const { data: { session: fresh } } = await supabase.auth.getSession();
      accessToken = fresh?.access_token ?? null;
    } catch {
      // Auth API instável/reiniciando — degrada para "não autenticado"
      // (redirect pro login) em vez de estourar a página.
      return null;
    }
  }
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id,nome,role,consentimento_em,terms_version,onboarding_concluido,onboarding_visto_em").eq("id", user.id).single();
  // PGRST116 = sem linha (perfil pendente). Outros erros são de rede —
  // trata como sem sessão para não mandar o usuário pro onboarding por engano.
  if (profileError && profileError.code !== "PGRST116") return null;
  return { supabase, user, profile, accessToken };
});

export async function requireSession(next = "/app", { consent = true, admin = false } = {}) {
  const destination = safeNext(next);
  const session = await verifiedSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(destination)}`);
  const profile = session.profile;
  if (!profile) redirect("/login?estado=perfil-pendente");
  if (admin && profile.role !== "admin") redirect("/app?estado=acesso-negado");
  if (consent && (!profile.consentimento_em || !profile.onboarding_concluido)) {
    redirect(`/completar-cadastro?next=${encodeURIComponent(destination)}`);
  }
  return { ...session, profile };
}
