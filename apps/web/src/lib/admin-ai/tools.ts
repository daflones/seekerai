import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, fetchAllAuthUsers } from "@/lib/supabase/admin";
import { fetchProviderCredits } from "@/lib/admin/provider-credits";

// Tools do agente admin: relatórios read-only + ações auditadas.
// Toda ação de escrita grava em audit_log com o ator (admin que pediu).

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const daysParam = {
  type: "integer",
  description: "Janela em dias (padrão 30).",
  minimum: 1,
  maximum: 365,
};

const userIdParam = {
  type: "string",
  description: "UUID do usuário — obtenha antes com find_user.",
};

export const ADMIN_AI_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "report_payments",
      description: "Relatório de pagamentos: totais por status e moeda, faturamento pago no período e os pagamentos mais recentes.",
      parameters: {
        type: "object",
        properties: { days: daysParam },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_subscriptions",
      description: "Assinaturas por status, MRR estimado, renovações nos próximos 7/30 dias e cancelamentos agendados.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "report_users",
      description: "Usuários: cadastros no período, total, onboarding concluído e atividade recente (buscas/jobs).",
      parameters: {
        type: "object",
        properties: { days: daysParam },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_usage",
      description: "Uso da plataforma no período: buscas, sites gerados, créditos consumidos por ação e falhas de jobs.",
      parameters: {
        type: "object",
        properties: { days: daysParam },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_forecast",
      description: "Previsão: receita esperada de renovações nos próximos N dias, novos pagantes no mês e tendência de churn.",
      parameters: {
        type: "object",
        properties: { days: daysParam },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_tickets",
      description: "Chamados de suporte: abertos, em andamento, resolvidos e os mais antigos sem resposta.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "find_user",
      description: "Procura usuário por e-mail ou nome. Retorna id, e-mail, plano e saldo — use antes de qualquer ação em usuário.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "E-mail completo ou trecho do nome." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "customer_summary",
      description: "Resumo completo de um usuário: perfil, assinatura, créditos, leads, sites, buscas e últimos pagamentos.",
      parameters: {
        type: "object",
        properties: { user_id: userIdParam },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "provider_credits",
      description: "Saldos dos provedores de IA/busca: Serper, ScrapeCreators e OpenRouter.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_plans",
      description: "Lista todos os planos com preço, créditos, ativo/visível na landing e ordem.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_credits",
      description: "Adiciona ou remove créditos da carteira de um usuário (delta positivo ou negativo). Ação auditada.",
      parameters: {
        type: "object",
        properties: {
          user_id: userIdParam,
          delta: { type: "integer", description: "Quantidade de créditos (negativo remove)." },
          motivo: { type: "string", description: "Motivo do ajuste (obrigatório)." },
        },
        required: ["user_id", "delta", "motivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_user_plan",
      description: "Atribui ou troca o plano de um usuário (cria assinatura se não houver ativa e concede a cota). Ação auditada.",
      parameters: {
        type: "object",
        properties: {
          user_id: userIdParam,
          plan_slug: { type: "string", description: "Slug do plano — veja list_plans." },
        },
        required: ["user_id", "plan_slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_subscription",
      description: "Cancela a assinatura ativa de um usuário imediatamente. Ação auditada — confirme com o admin antes.",
      parameters: {
        type: "object",
        properties: { user_id: userIdParam },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_plan_flags",
      description: "Ativa/desativa plano ou muda visibilidade na landing/destaque. Ação auditada.",
      parameters: {
        type: "object",
        properties: {
          plan_slug: { type: "string" },
          ativo: { type: "boolean", description: "Plano vendável (assinável)." },
          landing_visible: { type: "boolean", description: "Aparece na landing/#planos." },
          destaque: { type: "boolean", description: "Selo de destaque no card." },
        },
        required: ["plan_slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notify_users",
      description: "Envia notificação in-app para um usuário ou para TODOS os usuários. Ação auditada.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "UUID do destinatário. Omita para enviar a todos." },
          titulo: { type: "string", description: "Título curto (máx 200)." },
          corpo: { type: "string", description: "Texto da notificação (máx 1000)." },
        },
        required: ["titulo", "corpo"],
      },
    },
  },
];

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const cents = (v: number) => `R$ ${(v / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function audit(admin: SupabaseClient, ator: string, acao: string, alvo: string, diff: unknown) {
  await admin.from("audit_log").insert({
    ator, acao, alvo, diff: diff ?? {},
  }).then(() => {}, () => {});
}

async function findUserId(admin: SupabaseClient, query: string): Promise<{ id: string; nome: string; email?: string }[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
  const users = await fetchAllAuthUsers(admin);
  const { data: profs } = await admin.from("profiles").select("id,nome");
  const nameById = new Map((profs ?? []).map((p: { id: string; nome: string }) => [p.id, p.nome]));
  const hits = users.filter((u) =>
    (isEmail && (u.email ?? "").toLowerCase() === q) ||
    (!isEmail && (nameById.get(u.id) ?? "").toLowerCase().includes(q)));
  return hits.slice(0, 10).map((u) => ({ id: u.id, nome: nameById.get(u.id) ?? "", email: u.email }));
}

export async function executeAdminTool(
  admin: SupabaseClient,
  ator: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const days = Math.min(365, Math.max(1, num(args.days, 30)));
  const from = since(days);

  switch (name) {
    case "report_payments": {
      const { data } = await admin.from("payments")
        .select("status,method,amount_cents,currency,provider,created_at,user_id")
        .gte("created_at", from).order("created_at", { ascending: false }).limit(500);
      const rows = data ?? [];
      const byStatus = new Map<string, { n: number; cents: number }>();
      const byCur = new Map<string, number>();
      for (const p of rows) {
        const s = byStatus.get(p.status) ?? { n: 0, cents: 0 };
        s.n += 1; s.cents += p.amount_cents;
        byStatus.set(p.status, s);
        if (p.status === "paid") byCur.set(p.currency, (byCur.get(p.currency) ?? 0) + p.amount_cents);
      }
      return {
        periodoDias: days,
        total: rows.length,
        porStatus: Object.fromEntries([...byStatus].map(([k, v]) => [k, { qtd: v.n, valor: cents(v.cents) }])),
        faturadoPago: Object.fromEntries([...byCur].map(([k, v]) => [k.toUpperCase(), cents(v)])),
        recentes: rows.slice(0, 10).map((p) => ({
          quando: p.created_at, status: p.status, metodo: p.method,
          valor: cents(p.amount_cents), moeda: p.currency.toUpperCase(), provider: p.provider,
        })),
      };
    }

    case "report_subscriptions": {
      const subs = await fetchAllRows<{ status: string; current_period_end: string | null; cancel_at_period_end: boolean; plan_id: string }>(
        (from_, to) => admin.from("subscriptions").select("status,current_period_end,cancel_at_period_end,plan_id").range(from_, to),
      );
      const plans = await fetchAllRows<{ id: string; slug: string; nome: string; preco_centavos: number }>(
        (from_, to) => admin.from("plans").select("id,slug,nome,preco_centavos").range(from_, to),
      );
      const planById = new Map(plans.map((p) => [p.id, p]));
      const byStatus = new Map<string, number>();
      let mrr = 0, renew7 = 0, renew30 = 0, renewCount7 = 0, renewCount30 = 0, cancelScheduled = 0;
      const now = Date.now();
      for (const s of subs) {
        byStatus.set(s.status, (byStatus.get(s.status) ?? 0) + 1);
        if (s.status === "active") {
          const price = planById.get(s.plan_id)?.preco_centavos ?? 0;
          mrr += price;
          if (s.cancel_at_period_end) cancelScheduled += 1;
          if (s.current_period_end) {
            const d = new Date(s.current_period_end).getTime() - now;
            if (d > 0 && d <= 7 * 86_400_000) { renew7 += price; renewCount7 += 1; }
            if (d > 0 && d <= 30 * 86_400_000) { renew30 += price; renewCount30 += 1; }
          }
        }
      }
      return {
        porStatus: Object.fromEntries(byStatus),
        mrrEstimado: cents(mrr),
        renovaEm7d: { assinaturas: renewCount7, valor: cents(renew7) },
        renovaEm30d: { assinaturas: renewCount30, valor: cents(renew30) },
        cancelamentoAgendado: cancelScheduled,
      };
    }

    case "report_users": {
      const [{ count: total }, { count: novos }, { count: onboarded }] = await Promise.all([
        admin.from("profiles").select("id", { count: "exact", head: true }),
        admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", from),
        admin.from("profiles").select("id", { count: "exact", head: true }).eq("onboarding_concluido", true),
      ]);
      const { count: buscas } = await admin.from("search_jobs")
        .select("id", { count: "exact", head: true }).gte("created_at", from);
      const { count: admins } = await admin.from("profiles")
        .select("id", { count: "exact", head: true }).eq("role", "admin");
      return {
        periodoDias: days,
        total: total ?? 0,
        cadastrosNoPeriodo: novos ?? 0,
        onboardingConcluido: onboarded ?? 0,
        admins: admins ?? 0,
        jobsDeBuscaNoPeriodo: buscas ?? 0,
      };
    }

    case "report_usage": {
      const [{ count: buscas }, { count: sites }, { count: saidas }] = await Promise.all([
        admin.from("search_jobs").select("id", { count: "exact", head: true }).gte("created_at", from),
        admin.from("sites").select("id", { count: "exact", head: true }).gte("created_at", from),
        admin.from("lead_outputs").select("id", { count: "exact", head: true }).gte("created_at", from),
      ]);
      const { data: ledger } = await admin.from("credit_ledger")
        .select("motivo").lt("delta", 0).gte("created_at", from).limit(5000);
      const consumed = (ledger ?? []).reduce((acc, l) => {
        const m = /action:(\w+)/.exec(l.motivo ?? "");
        const k = m?.[1] ?? "outros";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const { data: fails } = await admin.from("search_jobs")
        .select("id", { count: "exact", head: true }).eq("status", "error").gte("created_at", from);
      return {
        periodoDias: days,
        buscas: buscas ?? 0,
        sitesGerados: sites ?? 0,
        saidasDeLead: saidas ?? 0,
        creditosConsumidosPorAcao: consumed,
        buscasComFalha: fails ?? 0,
      };
    }

    case "report_forecast": {
      const { data: subs } = await admin.from("subscriptions")
        .select("current_period_end,plan_id,status").eq("status", "active")
        .not("current_period_end", "is", null)
        .lte("current_period_end", new Date(Date.now() + days * 86_400_000).toISOString());
      const { data: plans } = await admin.from("plans").select("id,preco_centavos");
      const priceById = new Map((plans ?? []).map((p: { id: string; preco_centavos: number }) => [p.id, p.preco_centavos]));
      const byDay = new Map<string, { n: number; cents: number }>();
      for (const s of subs ?? []) {
        const day = (s.current_period_end as string).slice(0, 10);
        const cur = byDay.get(day) ?? { n: 0, cents: 0 };
        cur.n += 1; cur.cents += priceById.get(s.plan_id as string) ?? 0;
        byDay.set(day, cur);
      }
      const { count: pagantesMes } = await admin.from("payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "paid").gte("created_at", since(30));
      const { count: pagantesMesAnt } = await admin.from("payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "paid").gte("created_at", since(60)).lt("created_at", since(30));
      const { count: churnMes } = await admin.from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "canceled").gte("updated_at", since(30));
      return {
        horizonteDias: days,
        renovaçõesPrevistas: Object.fromEntries([...byDay.entries()].sort().map(([d, v]) => [
          d, { assinaturas: v.n, valor: cents(v.cents) },
        ])),
        pagantesUltimos30d: pagantesMes ?? 0,
        pagantes30dAnteriores: pagantesMesAnt ?? 0,
        assinaturasCanceladas30d: churnMes ?? 0,
      };
    }

    case "report_tickets": {
      const { data } = await admin.from("support_tickets")
        .select("status,created_at,updated_at").order("created_at", { ascending: true }).limit(1000);
      const rows = data ?? [];
      const byStatus = new Map<string, number>();
      for (const t of rows) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
      const oldest = rows.find((t) => !["resolvido", "cancelado", "expirado"].includes(t.status));
      return {
        total: rows.length,
        porStatus: Object.fromEntries(byStatus),
        abertoMaisAntigo: oldest ? { desde: oldest.created_at, status: oldest.status } : null,
      };
    }

    case "find_user": {
      const q = String(args.query ?? "");
      const hits = await findUserId(admin, q);
      if (!hits.length) return { encontrados: 0 };
      const out = [];
      for (const h of hits) {
        const [{ data: sub }, { data: wallet }] = await Promise.all([
          admin.from("subscriptions").select("status,plans:plan_id(slug,nome)")
            .eq("user_id", h.id).eq("status", "active").maybeSingle(),
          admin.from("credit_wallets").select("saldo").eq("user_id", h.id).maybeSingle(),
        ]);
        out.push({
          id: h.id, nome: h.nome, email: h.email,
          plano: (sub?.plans as { nome?: string } | null)?.nome ?? null,
          saldoCreditos: wallet?.saldo ?? 0,
        });
      }
      return { encontrados: out.length, usuarios: out };
    }

    case "customer_summary": {
      const userId = String(args.user_id ?? "");
      const [profile, sub, wallet, leads, outputs, sites, searches, payments] = await Promise.all([
        admin.from("profiles").select("id,nome,telefone,role,created_at,onboarding_concluido").eq("id", userId).maybeSingle(),
        admin.from("subscriptions").select("status,current_period_end,billing_months,provider,plans:plan_id(nome,slug)")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("credit_wallets").select("saldo").eq("user_id", userId).maybeSingle(),
        admin.from("leads").select("id", { count: "exact", head: true }).eq("user_id", userId),
        admin.from("lead_outputs").select("id", { count: "exact", head: true }).eq("user_id", userId),
        admin.from("sites").select("id", { count: "exact", head: true }).eq("user_id", userId),
        admin.from("search_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId),
        admin.from("payments").select("status,method,amount_cents,currency,provider,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      ]);
      if (!profile.data) return { erro: "Usuário não encontrado." };
      return {
        perfil: profile.data,
        assinatura: sub.data ? { ...sub.data, plano: (sub.data.plans as { nome?: string } | null)?.nome ?? null } : null,
        saldoCreditos: wallet.data?.saldo ?? 0,
        leads: leads.count ?? 0,
        saidasGeradas: outputs.count ?? 0,
        sites: sites.count ?? 0,
        buscas: searches.count ?? 0,
        ultimosPagamentos: payments.data ?? [],
      };
    }

    case "provider_credits": {
      const { credits, at } = await fetchProviderCredits();
      return { consultadoEm: at, creditos: credits };
    }

    case "list_plans": {
      const { data } = await admin.from("plans")
        .select("slug,nome,preco_centavos,creditos_mensais,ativo,landing_visible,destaque,ordem,intervalo")
        .order("ordem");
      return { planos: data ?? [] };
    }

    // ---------- Ações (auditadas) ----------

    case "adjust_credits": {
      const userId = String(args.user_id ?? "");
      const delta = Math.trunc(num(args.delta, 0));
      const motivo = String(args.motivo ?? "").trim();
      if (!delta || !motivo) return { erro: "delta e motivo são obrigatórios." };
      const ref = `admin-ai:adj:${crypto.randomUUID()}`;
      const { data: saldo, error } = await admin.rpc("apply_credit_delta", {
        p_user: userId, p_delta: delta, p_motivo: `Admin IA: ${motivo.slice(0, 200)}`, p_ref: ref,
      });
      if (error) return { erro: error.message.includes("Insufficient") ? "Saldo ficaria negativo." : error.message };
      await audit(admin, ator, "ai.adjust_credits", userId, { delta, motivo });
      return { ok: true, saldo };
    }

    case "set_user_plan": {
      const userId = String(args.user_id ?? "");
      const slug = String(args.plan_slug ?? "");
      const { data: plan } = await admin.from("plans").select("id,slug,nome,creditos_mensais").eq("slug", slug).single();
      if (!plan) return { erro: "Plano não encontrado." };
      const { data: active } = await admin.from("subscriptions")
        .select("id").eq("user_id", userId).eq("status", "active").maybeSingle();
      let subId: string;
      if (active) {
        const { error } = await admin.from("subscriptions").update({ plan_id: plan.id }).eq("id", active.id);
        if (error) return { erro: "Falha ao trocar o plano." };
        subId = active.id;
      } else {
        const { data: created, error } = await admin.from("subscriptions").insert({
          user_id: userId, plan_id: plan.id, provider: "admin", status: "active",
          current_period_end: (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString(); })(),
        }).select("id").single();
        if (error || !created) return { erro: "Falha ao criar a assinatura." };
        subId = created.id;
      }
      const ciclo = new Date().toISOString().slice(0, 7);
      const { error: grantErr } = await admin.rpc("grant_plan_allowance", {
        p_user: userId, p_plan: plan.id, p_cycle_ref: `admin-ai:${subId}:${ciclo}`,
      });
      await audit(admin, ator, "ai.set_user_plan", userId, { plan: slug, subId, grantErr: grantErr?.message ?? null });
      return grantErr
        ? { ok: true, aviso: `Plano aplicado, mas a cota falhou: ${grantErr.message}` }
        : { ok: true, plano: plan.nome };
    }

    case "cancel_subscription": {
      const userId = String(args.user_id ?? "");
      const { error, count } = await admin.from("subscriptions")
        .update({ status: "canceled", cancel_at_period_end: false }, { count: "exact" })
        .eq("user_id", userId).eq("status", "active");
      if (error) return { erro: "Falha ao cancelar." };
      if (!count) return { erro: "Usuário não tem assinatura ativa." };
      await audit(admin, ator, "ai.cancel_subscription", userId, {});
      return { ok: true };
    }

    case "set_plan_flags": {
      const slug = String(args.plan_slug ?? "");
      const patch: Record<string, boolean> = {};
      if (typeof args.ativo === "boolean") patch.ativo = args.ativo;
      if (typeof args.landing_visible === "boolean") patch.landing_visible = args.landing_visible;
      if (typeof args.destaque === "boolean") patch.destaque = args.destaque;
      if (!Object.keys(patch).length) return { erro: "Nada para alterar." };
      const { data, error } = await admin.from("plans").update(patch).eq("slug", slug).select("slug,nome").maybeSingle();
      if (error || !data) return { erro: "Plano não encontrado ou falha ao atualizar." };
      await audit(admin, ator, "ai.set_plan_flags", slug, patch);
      return { ok: true, plano: data.nome, alterado: patch };
    }

    case "notify_users": {
      const titulo = String(args.titulo ?? "").trim().slice(0, 200);
      const corpo = String(args.corpo ?? "").trim().slice(0, 1000);
      if (!titulo || !corpo) return { erro: "titulo e corpo são obrigatórios." };
      const userId = typeof args.user_id === "string" && args.user_id ? args.user_id : null;
      let targets: string[] = [];
      if (userId) {
        targets = [userId];
      } else {
        const profs = await fetchAllRows<{ id: string }>(
          (from_, to) => admin.from("profiles").select("id").range(from_, to),
        );
        targets = profs.map((p) => p.id).slice(0, 5000);
      }
      const rows = targets.map((uid) => ({
        user_id: uid, tipo: "admin_aviso", titulo, corpo,
      }));
      let sent = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin.from("notifications").insert(rows.slice(i, i + 500));
        if (error) return { erro: `Falha ao enviar notificações: ${error.message}`, enviadas: sent };
        sent += Math.min(500, rows.length - i);
      }
      await audit(admin, ator, "ai.notify_users", userId ?? "all", { titulo, total: sent });
      return { ok: true, enviadas: sent, titulo };
    }

    default:
      return { erro: `Ferramenta desconhecida: ${name}` };
  }
}
