import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";

const STATUS = ["novo", "contatado", "respondeu", "proposta", "ganho", "perdido"] as const;

const patchSchema = z.object({
  status: z.enum(STATUS).optional(),
  notas: z.string().max(2000).optional(),
  whatsapp: z.enum(["sim", "nao"]).nullish(),
});

const outputSchema = z.object({
  tipo: z.enum(["sales_reply", "deep_strategy", "generate_site", "generate_image"]),
  conteudo: z.string().min(1).max(400_000),
  modelo: z.string().max(120).nullish(),
});

async function requireOwner(request: NextRequest, leadId: string) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return { error: NextResponse.json({ error: "Origem não permitida." }, { status: 403 }) };
  }
  const session = await verifiedSession();
  if (!session) return { error: NextResponse.json({ error: "Entre novamente." }, { status: 401 }) };
  const { data: lead } = await session.supabase
    .from("leads").select("id").eq("id", leadId).eq("user_id", session.user.id).maybeSingle();
  if (!lead) return { error: NextResponse.json({ error: "Lead não encontrado." }, { status: 404 }) };
  return { session };
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { session, error } = await requireOwner(request, id);
  if (error) return error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }
  const { error: dbError } = await session.supabase
    .from("leads").update(parsed.data).eq("id", id).eq("user_id", session.user.id);
  if (dbError) return NextResponse.json({ error: "Não foi possível atualizar." }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { session, error } = await requireOwner(request, id);
  if (error) return error;
  const parsed = outputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Saída inválida." }, { status: 400 });
  const { data, error: dbError } = await session.supabase
    .from("lead_outputs")
    .insert({ lead_id: id, user_id: session.user.id, ...parsed.data })
    .select("id,tipo,modelo,created_at").single();
  if (dbError) return NextResponse.json({ error: "Não foi possível salvar a saída." }, { status: 400 });
  return NextResponse.json({ output: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { session, error } = await requireOwner(request, id);
  if (error) return error;
  const { error: dbError } = await session.supabase
    .from("leads").delete().eq("id", id).eq("user_id", session.user.id);
  if (dbError) return NextResponse.json({ error: "Não foi possível remover." }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
