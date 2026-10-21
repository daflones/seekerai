import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";

const trabalho = z.object({
  nome: z.string().trim().max(120).default(""),
  descricao: z.string().trim().max(200).default(""),
  resultado: z.string().trim().max(120).default(""),
  foto: z.string().max(400_000).nullable().default(null),
});

const schema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome ou o da empresa.").max(120),
  profissao: z.string().trim().max(140).default(""),
  audiencia: z.string().trim().max(140).default(""),
  diferencial: z.string().trim().max(300).default(""),
  whatsapp: z.string().trim().max(30).default(""),
  instagram: z.string().trim().max(80).default(""),
  foto_url: z.string().max(400_000).nullable().default(null),
  trabalhos: z.array(trabalho).max(3).default([]),
  prova: z.object({
    clientes: z.string().trim().max(20).default(""),
    anos: z.string().trim().max(20).default(""),
    nota: z.string().trim().max(10).default(""),
    depoimento: z.string().trim().max(280).default(""),
    autor: z.string().trim().max(80).default(""),
  }).default({ clientes: "", anos: "", nota: "", depoimento: "", autor: "" }),
  tema: z.enum(["padrao", "tecnologico", "bento"]).default("padrao"),
  publicado: z.boolean().default(false),
});

function slugify(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 48) || "perfil";
}

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
  if (!limit.allowed) return NextResponse.json({ error: "Aguarde antes de salvar novamente." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revise os campos." }, { status: 400 });
  }
  const input = parsed.data;

  if (input.tema !== "padrao") {
    const { data: subs } = await session.supabase.from("subscriptions")
      .select("status").eq("user_id", session.user.id).eq("status", "active").limit(1);
    if (!subs?.length && session.profile?.role !== "admin") {
      return NextResponse.json({ error: "Esse visual faz parte do plano Pro." }, { status: 403 });
    }
  }

  const { data: existing } = await session.supabase.from("portfolios")
    .select("id,slug").eq("user_id", session.user.id).maybeSingle();

  let slug = existing?.slug ?? slugify(input.nome);
  if (!existing) {
    for (let i = 0; i < 5; i += 1) {
      const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
      const { data: clash } = await session.supabase.from("portfolios")
        .select("id").eq("slug", candidate).maybeSingle();
      if (!clash) { slug = candidate; break; }
    }
  }

  const payload = { ...input, slug, user_id: session.user.id };
  const { error } = existing
    ? await session.supabase.from("portfolios").update(payload).eq("id", existing.id)
    : await session.supabase.from("portfolios").insert(payload);
  if (error) return NextResponse.json({ error: "Não foi possível salvar o portfólio." }, { status: 500 });
  return NextResponse.json({ ok: true, slug }, { headers: { "Cache-Control": "no-store" } });
}
