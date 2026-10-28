import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  active: z.boolean(),
});

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um pouco." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const { slug, active } = parsed.data;

  const admin = createSupabaseAdminClient();
  const { data: site } = await admin.from("sites")
    .select("slug,lead_id,publicado")
    .eq("slug", slug).maybeSingle();
  if (!site) return NextResponse.json({ error: "Site não encontrado." }, { status: 404 });

  // Posse: site de lead → dono do lead; site de estúdio → dono do projeto.
  let ownerId: string | null = null;
  if (site.lead_id) {
    const { data: lead } = await admin.from("leads")
      .select("user_id").eq("id", site.lead_id).maybeSingle();
    ownerId = lead?.user_id ?? null;
  } else {
    const { data: project } = await admin.from("studio_projects")
      .select("user_id").eq("site_slug", slug).maybeSingle();
    ownerId = project?.user_id ?? null;
  }
  if (!ownerId || ownerId !== session.user.id) {
    return NextResponse.json({ error: "Site não encontrado." }, { status: 404 });
  }

  const update = active
    ? {
      publicado: true, desativado_em: null, desativado_motivo: null,
      sem_expiracao: true, updated_at: new Date().toISOString(),
    }
    : {
      publicado: false, desativado_em: new Date().toISOString(),
      desativado_motivo: "manual", updated_at: new Date().toISOString(),
    };
  const { error } = await admin.from("sites").update(update).eq("slug", slug);
  if (error) {
    return NextResponse.json({ error: "Não foi possível alterar o site." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, publicado: active });
}
