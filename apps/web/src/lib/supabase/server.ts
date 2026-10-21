import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions, supabasePublicConfig } from "../auth/config";

export async function createSupabaseServerClient() {
  const config = supabasePublicConfig();
  if (!config) throw new Error("Autenticação não configurada.");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) store.set(name, value, { ...options, ...authCookieOptions });
        } catch {
          // Server Components cannot write cookies; middleware handles refresh there.
        }
      },
    },
  });
}
