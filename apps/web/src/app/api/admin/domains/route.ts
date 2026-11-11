import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { domainAutomationReady, provisionDns, delegationReady, attachHost, cleanupProvision } from "@/lib/domains/provision";

const reason = z.string().trim().max(300).optional().or(z.literal(""));
const HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const clean = (h: string) => h.trim().toLowerCase().replace(/^www\./, "");
const schema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("set-price"),
    priceCents: z.number().int().min(500).max(1_000_000),
    motivo: reason,
  }),
  z.object({
    acao: z.literal("provision"),
    domainId: z.string().uuid(),
    host: z.string().trim().toLowerCase().max(253).regex(HOST_RE, "Host inválido.").optional().or(z.literal("")),
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

type Session = NonNullable<Awaited<ReturnType<typeof verifiedSession>>>;

async function saveProvision(
  session: Session, domainId: string, zoneId: string | null, ns: string[], error: string | null,
) {
  await session.supabase.rpc("admin_domain_set_provision", {
    p_domain: domainId, p_zone_id: zoneId, p_nameservers: ns, p_error: error,
  });
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

  // Carrega o pedido pra provisionar/limpar (admin lê tudo via RLS).
  const { data: domain } = await session.supabase.from("domains")
    .select("id,desired_host,host,cf_zone_id,cf_nameservers")
    .eq("id", body.domainId).single();
  if (!domain) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  const host = clean(("host" in body && body.host ? body.host : domain.host ?? domain.desired_host) || "");
  let ns = (domain.cf_nameservers ?? []) as string[];

  // Provisionar: cria a zona CF + registros e devolve os NS pra delegação.
  if (body.acao === "provision") {
    try {
      const zone = await provisionDns(host);
      await saveProvision(session, domain.id, zone.zoneId, zone.nameServers, null);
      return NextResponse.json({ message: "DNS preparado.", nameservers: zone.nameServers },
        { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha no Cloudflare.";
      await saveProvision(session, domain.id, domain.cf_zone_id, ns, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // Ativar com automação: garante zona, confere delegação e anexa no
  // EasyPanel antes do activate. Sem envs → fluxo manual de sempre.
  if (body.acao === "activate" && domainAutomationReady()) {
    try {
      if (!domain.cf_zone_id || ns.length === 0) {
        const zone = await provisionDns(host);
        ns = zone.nameServers;
        await saveProvision(session, domain.id, zone.zoneId, ns, null);
      }
      if (!(await delegationReady(host, ns))) {
        await saveProvision(session, domain.id, domain.cf_zone_id, ns, "Aguardando delegação de nameservers.");
        return NextResponse.json({
          error: "O domínio ainda não aponta para os nameservers do Cloudflare. Registre/delegue no registro.br e tente de novo em alguns minutos.",
          nameservers: ns,
        }, { status: 409 });
      }
      await attachHost(host);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha no provisionamento.";
      await saveProvision(session, domain.id, domain.cf_zone_id, ns, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  const { data, error } = await session.supabase.rpc("admin_manage_domain", {
    p_domain: body.domainId,
    p_action: body.acao,
    p_host: body.acao === "activate" && host ? host : null,
    p_reason: body.motivo || null,
  });
  if (error) {
    const msg = error.message.includes("Invalid host") ? "Host inválido."
      : error.message.includes("activatable") ? "Pedido não está em estado ativável."
      : error.message.includes("renewed") ? "Só domínios ativos podem ser renovados."
      : "Não foi possível concluir.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Rejeitado/removido: limpa zona CF + host no EasyPanel (best effort).
  if (body.acao === "reject" || body.acao === "remove") {
    await cleanupProvision(domain.cf_zone_id, domain.host ?? domain.desired_host);
  }
  return NextResponse.json({ message: "Domínio atualizado.", result: data },
    { headers: { "Cache-Control": "no-store" } });
}
