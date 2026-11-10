import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { wipePrefix } from "@/lib/storage-wipe";

// Expiração em lote dos sites de lead com +7 dias sem fechar.
// Opcional: a leitura em lib/sites.ts já expira lazy — esta rota existe
// pra agendador externo (EasyPanel cron / Supabase scheduled edge) manter
// o banco limpo sem depender de tráfego.
export async function GET(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  // Aceita o secret de ambiente OU a chave do pg_cron (internal_kv).
  const key = request.headers.get("x-internal-key");
  if (key !== process.env.INTERNAL_CRON_SECRET) {
    const { data } = await admin.from("internal_kv")
      .select("value").eq("key", "cron_auth").maybeSingle();
    if (!data || key !== data.value) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }
  const { data, error } = await admin.rpc("expire_lead_sites");
  if (error) {
    return NextResponse.json({ error: "Falha ao expirar sites." }, { status: 500 });
  }
  // Proteção pós-plano/domínio: avisos de 7 dias + desativação sem proteção.
  const { data: grace, error: graceErr } = await admin.rpc("enforce_site_expirations");
  if (graceErr) {
    return NextResponse.json({ error: "Falha ao aplicar expirações." }, { status: 500 });
  }
  // Purga de 7 dias: apaga sites/outputs de leads não-ganhos e projetos
  // do estúdio sem "ganho" — e as pastas deles no bucket site-assets.
  const { data: purge, error: purgeErr } = await admin.rpc("purge_unwon_assets");
  if (purgeErr) {
    return NextResponse.json({ error: "Falha ao purgar assets expirados." }, { status: 500 });
  }
  const p = (purge ?? {}) as Record<string, unknown>;
  const slugs = Array.isArray(p.site_slugs) ? p.site_slugs as string[] : [];
  for (const slug of slugs) {
    await wipePrefix(admin, "site-assets", slug).catch(() => null);
  }
  return NextResponse.json({ expired: data ?? 0, grace: grace ?? null, purge: p });
}
