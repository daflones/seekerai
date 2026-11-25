import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ADMIN_AI_TOOLS, executeAdminTool } from "@/lib/admin-ai/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Agente admin na Groq (free tier, compatível com a API da OpenAI).
// O modelo conversa em pt-BR e usa tools pra consultar o banco e agir —
// ações de escrita são auditadas em audit_log com o admin como ator.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// gpt-oss é o modelo da casa na Groq (Llama foi descontinuado). 120b é o
// mais capaz; 20b é o fallback se o primeiro falhar/limitar.
const MODELS = [
  process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];
const MAX_TOOL_ROUNDS = 6;
const MAX_HISTORY = 30;

const SYSTEM_PROMPT = `Você é o agente administrativo do SeekerAi — SaaS brasileiro de prospecção de leads locais com IA (buscas no Google Maps, geração de sites, mensagens de abordagem). Você conversa com o dono/admin em português brasileiro, de forma direta e objetiva.

Você tem ferramentas para:
- RELATÓRIOS: pagamentos, assinaturas/MRR, usuários, uso da plataforma, previsão de renovações/churn, chamados, créditos dos provedores (Serper/ScrapeCreators/OpenRouter), resumo de cliente, lista de planos.
- AÇÕES: ajustar créditos, atribuir/trocar plano, cancelar assinatura, ativar/desativar plano ou visibilidade, enviar notificação in-app (um usuário ou todos).

Regras:
- Antes de agir sobre um usuário, identifique-o com find_user (e-mail ou nome) — nunca invente user_id.
- Ações destrutivas ou irreversíveis (cancelar assinatura, remover créditos em massa, notificar TODOS) exigem confirmação explícita do admin na conversa: pergunte "posso confirmar?" e só execute depois do "sim".
- Ajustes de crédito e troca de plano podem executar direto, mas sempre explique o que fez.
- Responda com números reais das ferramentas — nunca invente métricas. Se a ferramenta falhar, diga o erro.
- Formate valores em R$ e datas em dd/mm/aaaa. Seja conciso: o admin quer resposta, não texto longo.
- Se pedirem algo fora do seu alcance (reembolso no gateway, excluir conta, deploy), explique o limite e sugira o caminho manual.`;

type ChatMessage = { role: "user" | "assistant" | "system" | "tool"; content: string | null; tool_call_id?: string; tool_calls?: unknown[]; name?: string };

interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

async function groqChat(apiKey: string, model: string, messages: ChatMessage[]) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: ADMIN_AI_TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 4096,
      // gpt-oss raciocina antes de responder — "low" mantém o chat ágil.
      reasoning_effort: "low",
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`Groq ${res.status}: ${text.slice(0, 200)}`), { status: res.status });
  }
  return res.json() as Promise<{
    choices: { message: { role: string; content: string | null; tool_calls?: GroqToolCall[] } }[];
  }>;
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY não configurada no servidor." }, { status: 503 });
  }

  const limit = await authRateLimit("admin-ai", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de enviar de novo." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const body = (await request.json().catch(() => null)) as { messages?: { role: string; content: string }[] } | null;
  const history = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 8000) }));
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (!lastUser) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];
  const trace: { tool: string; resumo: string; erro?: boolean }[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let data: Awaited<ReturnType<typeof groqChat>> | null = null;
      let lastErr: unknown = null;
      for (const model of MODELS) {
        try {
          data = await groqChat(apiKey, model, messages);
          break;
        } catch (err) {
          lastErr = err;
          if ((err as { status?: number }).status === 429) break; // rate limit: não adianta trocar de modelo
        }
      }
      if (!data) throw lastErr instanceof Error ? lastErr : new Error("Falha na Groq.");

      const msg = data.choices[0]?.message;
      if (!msg) throw new Error("Resposta vazia da Groq.");

      const calls = msg.tool_calls ?? [];
      if (!calls.length) {
        return NextResponse.json(
          { reply: msg.content ?? "", trace },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: calls,
      });
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* args vazios */ }
        let result: unknown;
        try {
          result = await executeAdminTool(admin, session.user.id, call.function.name, args);
        } catch (err) {
          result = { erro: err instanceof Error ? err.message : "Falha na ferramenta." };
        }
        const resumo = summarize(call.function.name, result);
        trace.push({ tool: call.function.name, resumo, erro: typeof result === "object" && result !== null && "erro" in result });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result).slice(0, 12_000),
        });
      }
    }
    return NextResponse.json({ error: "O agente excedeu o limite de consultas. Tente uma pergunta mais direta." }, { status: 502 });
  } catch (err) {
    const status = (err as { status?: number }).status;
    console.error("[admin-ai]", err instanceof Error ? err.message : err);
    if (status === 429) {
      return NextResponse.json({ error: "Limite da Groq atingido — aguarde um minuto e tente de novo." }, { status: 429 });
    }
    return NextResponse.json({ error: "O agente está indisponível no momento." }, { status: 502 });
  }
}

// Resumo legível da tool pro painel (o conteúdo completo vai pro modelo).
function summarize(name: string, result: unknown): string {
  const r = result as Record<string, unknown>;
  if (r?.erro) return String(r.erro).slice(0, 120);
  switch (name) {
    case "report_payments": return `pagamentos: ${r.total ?? "?"} no período`;
    case "report_subscriptions": return `MRR ${r.mrrEstimado ?? "?"}`;
    case "report_users": return `${r.cadastrosNoPeriodo ?? "?"} cadastros`;
    case "report_usage": return `${r.buscas ?? "?"} buscas`;
    case "report_forecast": return `renovações em ${r.horizonteDias ?? "?"}d`;
    case "report_tickets": return `${r.total ?? "?"} chamados`;
    case "find_user": return `${r.encontrados ?? 0} usuário(s)`;
    case "customer_summary": return "resumo do cliente";
    case "provider_credits": return "saldos dos provedores";
    case "list_plans": return `${(r.planos as unknown[])?.length ?? 0} planos`;
    case "adjust_credits": return `saldo ${r.saldo ?? "?"}`;
    case "set_user_plan": return `plano: ${r.plano ?? r.aviso ?? "ok"}`;
    case "cancel_subscription": return "assinatura cancelada";
    case "set_plan_flags": return `flags de ${r.plano ?? "plano"}`;
    case "notify_users": return `${r.enviadas ?? 0} notificações`;
    default: return name;
  }
}
