import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";

// Polling leve pro modal PIX e pro retorno do checkout de cartão:
// diz se o pagamento confirmou (webhook já gravou), qual plano ativou
// e quanto saldo a carteira tem agora.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) {
    return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  }
  const ref = request.nextUrl.searchParams.get("ref")?.trim() ?? "";

  const [{ data: wallet }, { data: sub }] = await Promise.all([
    session.supabase.from("credit_wallets").select("saldo")
      .eq("user_id", session.user.id).maybeSingle(),
    session.supabase.from("subscriptions")
      .select("status,plans:plan_id(slug,nome,creditos_mensais)")
      .eq("user_id", session.user.id).eq("status", "active").maybeSingle(),
  ]);
  const subPlan = sub?.plans as { slug?: string; nome?: string; creditos_mensais?: number } | null;

  let status: string | null = null;
  let credits: number | null = null;
  if (ref && /^[\w:.-]{4,300}$/.test(ref)) {
    const { data: pay } = await session.supabase.from("payments")
      .select("status,metadata,plans:plan_id(creditos_mensais)")
      .eq("user_id", session.user.id).eq("provider_ref", ref).maybeSingle();
    status = pay?.status ?? null;
    const metaCredits = (pay?.metadata as { credits?: unknown } | null)?.credits;
    credits = typeof metaCredits === "number" && metaCredits > 0
      ? metaCredits
      : (pay?.plans as { creditos_mensais?: number } | null)?.creditos_mensais ?? null;
  }

  return NextResponse.json({
    status, // pending | paid | failed | expired | null (sem ref)
    active: sub?.status === "active",
    planSlug: subPlan?.slug ?? null,
    planName: subPlan?.nome ?? null,
    credits: credits ?? subPlan?.creditos_mensais ?? null,
    saldo: wallet?.saldo ?? 0,
  }, { headers: { "Cache-Control": "no-store" } });
}
