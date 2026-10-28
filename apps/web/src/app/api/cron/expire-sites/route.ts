import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Expiração em lote dos sites de lead com +7 dias sem fechar.
// Opcional: a leitura em lib/sites.ts já expira lazy — esta rota existe
// pra agendador externo (EasyPanel cron / Supabase scheduled edge) manter
// o banco limpo sem depender de tráfego.
export async function GET(request: NextRequest) {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret || request.headers.get("x-internal-key") !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("expire_lead_sites");
  if (error) {
    return NextResponse.json({ error: "Falha ao expirar sites." }, { status: 500 });
  }
  return NextResponse.json({ expired: data ?? 0 });
}
