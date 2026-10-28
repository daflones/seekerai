import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";

const reason = z.string().trim().max(300).optional().or(z.literal(""));
const HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const schema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("set-price"),
    priceCents: z.number().int().min(500).max(1_000_000),
    motivo: reason,
  }),
  z.object({
    acao: z.literal("activate"),
    domainId: z.string().uuid(),
    host: z.string().trim().toLowerCase().max(253).regex(HOST_RE, "Host inválido.").optional().or(z.literal("")),
    motivo: reason,
  }),
  z.object({ acao: z.literal("reject"), domainId: z.string().uuid(), motivo: reason }),
  z.object({ acao: z.literal("remove"), domainId: z.string().uuid(), motivo: reason }),
  z.object({ acao: z.literal("renew"), domainId: z.string().uuid(), motivo: reason }),
]);

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Revise os campos." }, { status: 400 });
  }

  const limit = await authRateLimit("admin-integration", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de salvar novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const body = parsed.data;
  if (body.acao === "set-price") {
    const { error } = await session.supabase.rpc("configure_app_setting", {
      p_key: "domain_price_cents",
      p_value: body.priceCents,
      p_reason: body.motivo || "Preço do domínio ajustado pelo painel.",
    });
    if (error) return NextResponse.json({ error: "Não foi possível salvar o preço." }, { status: 400 });
    return NextResponse.json({ message: "Preço atualizado." }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await session.supabase.rpc("admin_manage_domain", {
    p_domain: body.domainId,
    p_action: body.acao,
    p_host: body.acao === "activate" && body.host ? body.host : null,
    p_reason: body.motivo || null,
  });
  if (error) {
    const msg = error.message.includes("Invalid host") ? "Host inválido."
      : error.message.includes("activatable") ? "Pedido não está em estado ativável."
      : error.message.includes("renewed") ? "Só domínios ativos podem ser renovados."
      : "Não foi possível concluir.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ message: "Domínio atualizado.", result: data },
    { headers: { "Cache-Control": "no-store" } });
}
