import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Resumo do cliente dentro do chamado: o admin vê plano, saldo, uso e
// pagamentos sem sair da conversa (ações ficam em /api/admin/users).
export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }
  const userId = request.nextUrl.searchParams.get("user") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const [profile, sub, wallet, leads, outputs, studio, searches, payments, plans] =
    await Promise.all([
      admin.from("profiles").select("id,nome,telefone,role,created_at").eq("id", userId).maybeSingle(),
      admin.from("subscriptions")
        .select("id,status,current_period_end,billing_months,provider,plans:plan_id(nome,slug)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("credit_wallets").select("saldo").eq("user_id", userId).maybeSingle(),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("lead_outputs").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("studio_projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("search_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("payments")
        .select("id,status,method,amount_cents,provider,created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(4),
      admin.from("plans").select("id,slug,nome,creditos_mensais,preco_centavos")
        .eq("ativo", true).order("ordem"),
    ]);

  if (!profile.data) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  const subRow = sub.data
    ? { ...sub.data, plano: (sub.data.plans as { nome?: string } | null)?.nome ?? null }
    : null;

  return NextResponse.json({
    perfil: profile.data,
    assinatura: subRow,
    saldo: wallet.data?.saldo ?? 0,
    uso: {
      buscas: searches.count ?? 0,
      leads: leads.count ?? 0,
      criacoes: outputs.count ?? 0,
      apps: studio.count ?? 0,
    },
    pagamentos: payments.data ?? [],
    planos: plans.data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}
