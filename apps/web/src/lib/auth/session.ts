import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "../supabase/server";
import { supabasePublicConfig } from "./config";
import { verifyAccessToken } from "./jwt";
import { safeNext } from "./validation";

export const verifiedSession = cache(async () => {
  if (!supabasePublicConfig()) return null;
  const supabase = await createSupabaseServerClient();
  // Lê a sessão do cookie e confere a assinatura localmente — só chama a
  // Auth API (getUser) como fallback. Reduz chamadas de rede e refreshs
  // concorrentes que derrubavam requests com 409/504.
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  let user = session?.user ?? null;
  if (!(await verifyAccessToken(token))) {
    const { data: { user: checked }, error } = await supabase.auth.getUser();
    if (error || !checked) return null;
    user = checked;
  }
  if (!user?.email_confirmed_at) return null;
  const { data: profile } = await supabase.from("profiles")
    .select("id,nome,role,consentimento_em,terms_version,onboarding_concluido,onboarding_visto_em").eq("id", user.id).single();
  return { supabase, user, profile };
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
