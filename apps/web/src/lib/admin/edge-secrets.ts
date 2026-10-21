import "server-only";

export const REQUIRED_SECRETS = [
  "APP_ENCRYPTION_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "MERCOSULPAY_API_KEY", "MERCOSULPAY_WEBHOOK_SECRET", "MERCOSULPAY_API_URL",
  "GOOGLE_PLACES_API_KEY", "APIFY_API_TOKEN", "OPENROUTER_API_KEY",
  "EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCE",
  "AI_TEXT_MODEL", "AI_IMAGE_MODEL", "AI_SITE_MODEL",
] as const;

// Lista nomes de secrets configurados nas Edge Functions via Management API
// (write-only: só dá pra saber se existe, nunca o valor). Sem token, retorna null.
export async function edgeSecretNames(): Promise<string[] | null> {
  const ref = process.env.SUPABASE_PROJECT_REF
    || process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/)?.[1];
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) return null;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string }[];
    return data.map((item) => item.name ?? "").filter(Boolean);
  } catch {
    return null;
  }
}

export type SecretFonte = "supabase" | "painel" | "ausente";

export function secretsStatus(edge: string[] | null, panelNames: Iterable<string>) {
  const edgeSet = new Set(edge ?? []);
  const panelSet = new Set(panelNames);
  return REQUIRED_SECRETS.map((nome) => ({
    nome,
    fonte: (edgeSet.has(nome) ? "supabase" : panelSet.has(nome) ? "painel" : "ausente") as SecretFonte,
  }));
}
