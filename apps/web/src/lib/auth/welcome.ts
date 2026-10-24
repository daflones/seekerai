import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabasePublicConfig } from "./config";

// Boas-vindas no WhatsApp do recém-cadastrado. A flag profiles.boas_vindas_em
// faz o dedup entre o cadastro e a conclusão do onboarding — quem marcar
// primeiro dispara. Best-effort: nunca quebra o fluxo de auth.
export function sendWelcomeWhatsapp(
  userId: string,
  input: { nome: string; telefone: string | null | undefined; email?: string | null },
): void {
  const config = supabasePublicConfig();
  const internalKey = process.env.INTERNAL_CRON_SECRET;
  if (!config || !internalKey) return;
  const admin = createSupabaseAdminClient();
  void (async () => {
    try {
      const { data } = await admin.from("profiles")
        .update({ boas_vindas_em: new Date().toISOString() })
        .eq("id", userId)
        .is("boas_vindas_em", null)
        .select("id")
        .maybeSingle();
      if (!data) return;
      await fetch(`${config.url}/functions/v1/welcome-message`, {
        method: "POST",
        headers: {
          "x-internal-key": internalKey,
          apikey: config.key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nome: input.nome,
          telefone: input.telefone ?? null,
          email: input.email ?? null,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch { /* best-effort */ }
  })();
}
