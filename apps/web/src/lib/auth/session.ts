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
  if (!user) {
    const { data: { user: checked }, error } = await supabase.auth.getUser();
    if (error || !checked || !checked.email_confirmed_at) return null;
    user = checked;
    const { data: { session: fresh } } = await supabase.auth.getSession();
    accessToken = fresh?.access_token ?? null;
  }
  const { data: profile } = await supabase.from("profiles")
    .select("id,nome,role,consentimento_em,terms_version,onboarding_concluido,onboarding_visto_em").eq("id", user.id).single();
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
