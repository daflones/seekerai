import { Users } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadAdminUsers } from "@/lib/admin-users";
import { AdminUsers } from "@/components/admin-users";

export default async function AdminUsuariosPage() {
  await requireSession("/admin/usuarios", { admin: true });
  const [users, admin] = [await loadAdminUsers(), createSupabaseAdminClient()];
  const { data: plans } = await admin.from("plans")
    .select("slug,nome,creditos_mensais").eq("ativo", true).order("ordem");

  const assinantes = users.filter((u) => u.subStatus === "active").length;
  const saldoTotal = users.reduce((a, u) => a + u.saldo, 0);
  const fechado = users.reduce((a, u) => a + u.valorFechado, 0);

  return <>
    <span className="eyebrow">GESTÃO DE CONTAS</span>
    <h1>Usuários da plataforma<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      {users.length} contas · {assinantes} assinantes · {saldoTotal} créditos em circulação ·{" "}
      {fechado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} fechados em vendas.
    </p>

    <AdminUsers users={users} plans={plans ?? []} />

    <p className="private-disclaimer">
      <Users size={13} /> Clique em um usuário para ver funil de leads, criações de IA e controles de plano e saldo.
    </p>
  </>;
}
