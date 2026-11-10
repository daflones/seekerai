import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Marca um projeto do estúdio como "ganho" e o vincula a um cliente do
// CRM — existente (leadId) ou novo (clientName). O lead vira "ganho" e
// o projeto (e o site publicado dele) sai da purga de 7 dias.
const bodySchema = z.object({
  projectId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
}).refine(v => v.leadId || v.clientName, { message: "Informe o cliente." });

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (!session.profile?.consentimento_em || !session.profile?.onboarding_concluido) {
    return NextResponse.json({ error: "Conclua seu cadastro antes." }, { status: 403 });
  }

  let value: unknown;
  try { value = await request.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(value);
  if (!parsed.success) return NextResponse.json({ error: "Revise os campos." }, { status: 400 });

  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de tentar novamente." }, { status: 429 });
  }

  // Só o dono marca (RLS); precisa existir e ter terminado.
  const { data: project } = await session.supabase.from("studio_projects")
    .select("id,site_slug,lead_id,ganho_em,status")
    .eq("id", parsed.data.projectId).maybeSingle();
  if (!project || project.status !== "done") {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  let leadId = parsed.data.leadId ?? null;
  let leadName = "";

  if (leadId) {
    // Lead existente — RLS garante que é do usuário.
    const { data: lead } = await session.supabase.from("leads")
      .select("id,nome").eq("id", leadId).maybeSingle();
    if (!lead) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    leadName = lead.nome as string;
    await admin.from("leads").update({ status: "ganho" }).eq("id", leadId);
  } else {
    // Cliente novo criado na hora, já como ganho (comprou o app/site).
    const { data: lead, error } = await admin.from("leads")
      .insert({
        user_id: session.user.id,
        service_slug: "sites",
        nome: parsed.data.clientName!,
        status: "ganho",
        dados: { origem: "studio" },
      })
      .select("id,nome").single();
    if (error || !lead) {
      return NextResponse.json({ error: "Não foi possível criar o cliente." }, { status: 400 });
    }
    leadId = lead.id as string;
    leadName = lead.nome as string;
  }

  const now = new Date().toISOString();
  await admin.from("studio_projects")
    .update({ lead_id: leadId, ganho_em: now, updated_at: now })
    .eq("id", project.id);

  // O site publicado do projeto passa a contar como site do cliente
  // (ganho → fora da expiração de 7 dias).
  if (project.site_slug) {
    await admin.from("sites")
      .update({ lead_id: leadId }).eq("slug", project.site_slug);
  }

  return NextResponse.json(
    { lead: { id: leadId, nome: leadName }, ganhoEm: now },
    { headers: { "Cache-Control": "no-store" } },
  );
}
