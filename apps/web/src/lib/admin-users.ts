import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AdminUserRow {
  id: string;
  nome: string;
  email: string;
  role: string;
  onboarding: boolean;
  createdAt: string;
  saldo: number;
  planSlug: string | null;
  planNome: string | null;
  planPreco: number | null;
  subStatus: string | null;
  periodEnd: string | null;
  leads: Record<string, number>;
  leadsTotal: number;
  outputs: Record<string, number>;
  outputsTotal: number;
  valorFechado: number;
  jobsRunning: number;
  jobsError: number;
}

const LEAD_STAGES = ["novo", "contatado", "respondeu", "proposta", "ganho", "perdido"];

// Visão completa por usuário: perfil + auth + carteira + assinatura + funil de leads + criações.
export async function loadAdminUsers(): Promise<AdminUserRow[]> {
  const admin = createSupabaseAdminClient();
  const [profiles, wallets, subs, leads, outputs, jobs, authUsers] = await Promise.all([
    admin.from("profiles").select("id,nome,role,onboarding_concluido,created_at").order("created_at", { ascending: false }).limit(2000),
    admin.from("credit_wallets").select("user_id,saldo"),
    admin.from("subscriptions").select("user_id,status,current_period_end,created_at,plans(slug,nome,preco_centavos)").neq("status", "canceled").order("created_at", { ascending: false }),
    admin.from("leads").select("user_id,status,valor_fechado"),
    admin.from("lead_outputs").select("user_id,tipo"),
    admin.from("ai_jobs").select("user_id,status"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailById = new Map((authUsers.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const saldoById = new Map((wallets.data ?? []).map((w) => [w.user_id, w.saldo]));
  // A assinatura relevante é a ativa; senão, a mais recente não cancelada.
  const subById = new Map<string, { slug: string; nome: string; preco: number; status: string; end: string | null }>();
  for (const s of subs.data ?? []) {
    const plan = s.plans as unknown as { slug: string; nome: string; preco_centavos: number } | null;
    const cur = subById.get(s.user_id);
    if (!cur || s.status === "active") {
      subById.set(s.user_id, {
        slug: plan?.slug ?? "", nome: plan?.nome ?? "", preco: plan?.preco_centavos ?? 0,
        status: s.status, end: s.current_period_end,
      });
    }
  }
  const leadsByUser = new Map<string, { stages: Record<string, number>; total: number; valor: number }>();
  for (const l of leads.data ?? []) {
    const cur = leadsByUser.get(l.user_id) ?? { stages: {}, total: 0, valor: 0 };
    cur.stages[l.status] = (cur.stages[l.status] ?? 0) + 1;
    cur.total += 1;
    if (l.status === "ganho") cur.valor += Number(l.valor_fechado ?? 0);
    leadsByUser.set(l.user_id, cur);
  }
  const outputsByUser = new Map<string, { tipos: Record<string, number>; total: number }>();
  for (const o of outputs.data ?? []) {
    const cur = outputsByUser.get(o.user_id) ?? { tipos: {}, total: 0 };
    cur.tipos[o.tipo] = (cur.tipos[o.tipo] ?? 0) + 1;
    cur.total += 1;
    outputsByUser.set(o.user_id, cur);
  }

  const jobsByUser = new Map<string, { running: number; error: number }>();
  for (const j of jobs.data ?? []) {
    const cur = jobsByUser.get(j.user_id) ?? { running: 0, error: 0 };
    if (j.status === "running") cur.running += 1;
    else if (j.status === "error") cur.error += 1;
    jobsByUser.set(j.user_id, cur);
  }

  return (profiles.data ?? []).map((p) => {
    const sub = subById.get(p.id);
    const leadsAgg = leadsByUser.get(p.id) ?? { stages: {}, total: 0, valor: 0 };
    const outputsAgg = outputsByUser.get(p.id) ?? { tipos: {}, total: 0 };
    return {
      id: p.id,
      nome: p.nome || "—",
      email: emailById.get(p.id) ?? "",
      role: p.role,
      onboarding: p.onboarding_concluido,
      createdAt: p.created_at,
      saldo: saldoById.get(p.id) ?? 0,
      planSlug: sub?.slug ?? null,
      planNome: sub?.nome ?? null,
      planPreco: sub?.preco ?? null,
      subStatus: sub?.status ?? null,
      periodEnd: sub?.end ?? null,
      leads: Object.fromEntries(LEAD_STAGES.map((s) => [s, leadsAgg.stages[s] ?? 0])),
      leadsTotal: leadsAgg.total,
      outputs: outputsAgg.tipos,
      outputsTotal: outputsAgg.total,
      valorFechado: leadsAgg.valor,
      jobsRunning: jobsByUser.get(p.id)?.running ?? 0,
      jobsError: jobsByUser.get(p.id)?.error ?? 0,
    };
  });
}
