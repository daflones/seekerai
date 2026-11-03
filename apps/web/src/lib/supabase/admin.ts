import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Integração de servidor não configurada.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// O PostgREST corta qualquer resposta em ~1000 linhas (max-rows), mesmo com
// .limit() maior — pagina por range até esgotar para não perder registros.
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = await page(from, from + pageSize - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

// listUsers pagina por `page` — primeira chamada já mostra se há mais.
export async function fetchAllAuthUsers(
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<{ id: string; email?: string }[]> {
  const out: { id: string; email?: string }[] = [];
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    if (!users.length) break;
    out.push(...users.map((u) => ({ id: u.id, email: u.email })));
    if (users.length < 1000) break;
  }
  return out;
}
