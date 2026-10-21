import { NextResponse } from "next/server";
import { verifiedSession } from "@/lib/auth/session";

// Lista de chamados para o painel admin (RLS já filtra por is_admin()).
export async function GET() {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }
  const { data: tickets, error } = await session.supabase
    .from("support_tickets")
    .select("id,assunto,categoria,prioridade,status,created_at,updated_at,user_id")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "Não foi possível listar os chamados." }, { status: 500 });

  const ids = (tickets ?? []).map((t) => t.user_id);
  const { data: profiles } = ids.length
    ? await session.supabase.from("profiles").select("id,nome").in("id", ids)
    : { data: [] };
  const nomes = new Map((profiles ?? []).map((p) => [p.id, p.nome]));

  return NextResponse.json(
    { tickets: (tickets ?? []).map((t) => ({ ...t, cliente: nomes.get(t.user_id) ?? "Cliente" })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
