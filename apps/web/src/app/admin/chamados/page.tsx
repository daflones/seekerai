import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { AdminChamados } from "@/components/admin-chamados";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chamados", robots: { index: false, follow: false } };

export default async function AdminChamadosPage() {
  const { supabase } = await requireSession("/admin/chamados", { admin: true });
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id,assunto,categoria,prioridade,status,atendente,created_at,user_id")
    .order("updated_at", { ascending: false })
    .limit(200);

  const ids = [...new Set((tickets ?? []).map((t) => t.user_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id,nome").in("id", ids)
    : { data: [] };
  const nomes = new Map((profiles ?? []).map((p) => [p.id, p.nome]));
  const list = (tickets ?? []).map((t) => ({ ...t, cliente: nomes.get(t.user_id) ?? "Cliente" }));

  return <>
    <span className="eyebrow">SUPORTE</span>
    <h1>Chamados<span className="gradient-text">.</span></h1>
    <p className="private-intro">Responda os clientes pela conversa e mude o status conforme o andamento.</p>
    <section className="dash-panel">
      <AdminChamados tickets={list} />
    </section>
  </>;
}
