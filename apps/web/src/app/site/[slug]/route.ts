import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Serve o site gerado de um lead numa URL pública: /site/<slug-do-estabelecimento>.
// O slug fica em leads.dados->>siteSlug e é definido quando o site é gerado/salvo.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return new NextResponse("Not found", { status: 404 });

  const admin = createSupabaseAdminClient();
  const { data: lead } = await admin.from("leads")
    .select("id").eq("dados->>siteSlug", slug).maybeSingle();
  if (!lead) return new NextResponse("Not found", { status: 404 });

  const { data: output } = await admin.from("lead_outputs")
    .select("conteudo").eq("lead_id", lead.id).eq("tipo", "generate_site")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!output?.conteudo) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(output.conteudo, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
