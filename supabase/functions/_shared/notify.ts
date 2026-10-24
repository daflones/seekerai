// Notificações pro dono via WhatsApp (Evolution API).
// Dois fluxos:
//   notifyError — erro de plataforma; uma IA barata analisa e define
//                 urgência + escreve a mensagem.
//   notifySale  — evento de negócio (assinatura, recarga, reembolso)
//                 com valores e detalhes.
// Tudo best-effort: nunca derruba a request que chamou.

import { asString, isRecord, serviceClient } from "./common.ts";
import { getSecret } from "./secrets.ts";

// LID do número do dono — contas LID-migradas não recebem envio pro
// JID @s.whatsapp.net pela Evolution 2.3.7 (resolve quando atualizar o server).
const ADMIN_NUMBER_FALLBACK = "29421146759233@lid";

export interface NotifyUser {
  id?: string | null;
  email?: string | null;
  nome?: string | null;
}

export interface NotifyErrorInput {
  /** Onde quebrou — "places-search", "generate_site", "webhook". */
  onde: string;
  /** Mensagem de erro resumida (sem stack inteira). */
  erro: string;
  /** O que estava rodando ("busca 'padaria pinheiros'", "site do lead X"). */
  contexto?: string;
  usuario?: NotifyUser | null;
  /** Negócio envolvido, quando houver (lead do site, por ex.). */
  negocio?: { nome?: string | null; categoria?: string | null; cidade?: string | null } | null;
}

export interface NotifySaleInput {
  /** "assinatura" | "recarga" | "reembolso" | "revisao" */
  tipo: string;
  valorReais?: number | null;
  descricao?: string;
  usuario?: NotifyUser | null;
}

/** Envia texto pra qualquer número E.164 via Evolution. Silencioso em falha. */
export async function sendWhatsAppTo(number: string, text: string): Promise<void> {
  try {
    const base = (await getSecret("EVOLUTION_API_URL"))?.replace(/\/+$/, "");
    const key = await getSecret("EVOLUTION_API_KEY");
    const instance = await getSecret("EVOLUTION_INSTANCE");
    if (!base || !key || !instance) return;
    await fetch(`${base}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch { /* notificação nunca derruba a request */ }
}

/** Envia texto pro número do dono. Silencioso em qualquer falha. */
async function sendWhatsapp(text: string): Promise<void> {
  try {
    const number = (await getSecret("ADMIN_WHATSAPP")) ?? ADMIN_NUMBER_FALLBACK;
    await sendWhatsAppTo(number, text);
  } catch { /* notificação nunca derruba a request */ }
}

interface Composed { urgencia: "baixa" | "media" | "alta" | "critica"; mensagem: string }

const NOTIFY_SYSTEM = `Você é o monitor da SeekerAi, plataforma brasileira que gera sites e leads para pequenos negócios.
Analise o evento e responda SOMENTE com JSON: {"urgencia":"baixa|media|alta|critica","mensagem":"..."}

Critério de urgência:
- critica: dinheiro perdido, pagamento travado, plataforma inteira fora, usuário impossibilitado de receber o que pagou
- alta: funcionalidade principal quebrada (busca não retorna, site não gera), provedor-chave fora
- media: falha parcial com fallback que funcionou, lentidão, erro isolado de um usuário
- baixa: aviso, evento positivo de negócio, erro transitório já resolvido

A "mensagem" é o texto do WhatsApp pro dono, em pt-BR, direto e humano:
- erro: comece com o emoji da urgência (🟢🔵🟠🔴), diga O QUE aconteceu, ONDE, COM QUEM (negócio/usuário), QUANDO (horário), e se tem ação necessária. Máx ~6 linhas.
- venda/evento: comece com 🎉 ou 💰, diga o que foi adquirido, valor em R$, plano/pacote e quem comprou. Máx ~6 linhas.
Não invente dados que não vieram no evento.`;

/** IA escreve a mensagem e define a urgência. Fallback: template determinístico. */
async function compose(system: string, evento: string, fallback: Composed): Promise<Composed> {
  const tryParse = (raw: unknown): Composed | null => {
    if (typeof raw !== "string") return null;
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      const urgencia = asString(j.urgencia, 10);
      const mensagem = asString(j.mensagem, 800);
      if (!mensagem) return null;
      const u = urgencia === "baixa" || urgencia === "media" || urgencia === "alta" || urgencia === "critica"
        ? urgencia : fallback.urgencia;
      return { urgencia: u, mensagem };
    } catch { return null; }
  };

  const apiKey = await getSecret("OPENROUTER_API_KEY");
  if (apiKey) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        "X-Title": "SeekerAi-Notify",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini", max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: evento },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null) as Record<string, unknown> | null;
      const choices = data && Array.isArray(data.choices) ? data.choices : [];
      const c = isRecord(choices[0]) && isRecord(choices[0].message)
        ? choices[0].message.content : null;
      const parsed = tryParse(c);
      if (parsed) return parsed;
    }
  }
  return fallback;
}

const WELCOME_SYSTEM = `Você é a voz da SeekerAi, plataforma que encontra empresas locais que precisam de serviços digitais (sites, social media, design, marketing) e gera sites, mensagens de prospecção e imagens com IA.
Escreva a mensagem de boas-vindas no WhatsApp pra quem acabou de se cadastrar, em pt-BR:
- tom caloroso e direto, como um sócio que quer ver a pessoa ganhar dinheiro
- 4 a 7 linhas: boas-vindas com o nome, o que ela ganha (radar de leads, sites prontos, mensagens de outreach com IA, imagens), e um empurrão pra criar o primeiro conteúdo/fazer a primeira busca agora
- pode usar 2-3 emojis, sem exagero; nada de markdown nem links inventados
- termine convidando a fazer a primeira busca de leads`;

/** Texto livre (sem JSON) gerado pela IA barata; fallback determinístico. */
async function composeText(system: string, user: string, fallback: string): Promise<string> {
  const apiKey = await getSecret("OPENROUTER_API_KEY");
  if (apiKey) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        "X-Title": "SeekerAi-Notify",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini", max_tokens: 320,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null) as Record<string, unknown> | null;
      const choices = data && Array.isArray(data.choices) ? data.choices : [];
      const c = isRecord(choices[0]) && isRecord(choices[0].message)
        ? choices[0].message.content : null;
      const text = asString(c, 900);
      if (text) return text;
    }
  }
  return fallback;
}

/** Mensagem de boas-vindas pro WhatsApp do usuário recém-cadastrado. */
export async function welcomeCopy(nome: string | null): Promise<string> {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] || "tudo bem";
  const fallback = `Olá, ${primeiro}! 👋 Seja muito bem-vindo(a) à SeekerAi.\n\nAqui você encontra empresas perto de você que precisam exatamente do que você vende — e já sai com site, mensagem de prospecção e imagens gerados por IA.\n\nBora começar? Faça sua primeira busca de leads agora e veja as oportunidades esperando por você. 🚀`;
  return composeText(WELCOME_SYSTEM, `Novo usuário cadastrado: ${primeiro}`, fallback);
}

function fmtUser(u?: NotifyUser | null): string {
  if (!u) return "—";
  return [u.nome, u.email, u.id?.slice(0, 8)].filter(Boolean).join(" · ") || "—";
}

/** Erro de plataforma → WhatsApp com análise de urgência por IA. */
export async function notifyError(input: NotifyErrorInput): Promise<void> {
  try {
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const negocio = input.negocio
      ? [input.negocio.nome, input.negocio.categoria, input.negocio.cidade].filter(Boolean).join(" — ")
      : "—";
    const evento = [
      `Tipo: ERRO DE PLATAFORMA`,
      `Onde: ${input.onde}`,
      `Erro: ${input.erro.slice(0, 400)}`,
      `Contexto: ${input.contexto ?? "—"}`,
      `Negócio: ${negocio}`,
      `Usuário: ${fmtUser(input.usuario)}`,
      `Quando: ${quando} (São Paulo)`,
    ].join("\n");
    const fallback: Composed = {
      urgencia: "media",
      mensagem: `🟠 Erro em ${input.onde}\n${input.erro.slice(0, 200)}\nContexto: ${input.contexto ?? "—"}\nUsuário: ${fmtUser(input.usuario)}\n${quando}`,
    };
    const { mensagem } = await compose(NOTIFY_SYSTEM, evento, fallback);
    await sendWhatsapp(mensagem);
  } catch { /* nunca propaga */ }
}

/** Evento de negócio (assinatura, recarga, revisão) → WhatsApp com detalhes. */
export async function notifySale(input: NotifySaleInput): Promise<void> {
  try {
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const valor = input.valorReais != null
      ? `R$ ${input.valorReais.toFixed(2).replace(".", ",")}`
      : "valor não informado";
    const evento = [
      `Tipo: EVENTO DE NEGÓCIO (${input.tipo})`,
      `Detalhes: ${input.descricao ?? input.tipo}`,
      `Valor: ${valor}`,
      `Usuário: ${fmtUser(input.usuario)}`,
      `Quando: ${quando} (São Paulo)`,
    ].join("\n");
    const emoji = input.tipo === "revisao" || input.tipo === "reembolso" ? "🟠" : "🎉";
    const fallback: Composed = {
      urgencia: "baixa",
      mensagem: `${emoji} ${input.tipo === "reembolso" ? "Reembolso" : "Nova " + input.tipo}!\n${input.descricao ?? ""}\nValor: ${valor}\nUsuário: ${fmtUser(input.usuario)}\n${quando}`,
    };
    const { mensagem } = await compose(NOTIFY_SYSTEM, evento, fallback);
    await sendWhatsapp(mensagem);
  } catch { /* nunca propaga */ }
}

/** Busca email/nome do usuário dono de um user_id (service role). */
export async function notifyUserOf(userId: string | null | undefined): Promise<NotifyUser | null> {
  if (!userId) return null;
  try {
    const { data } = await serviceClient()
      .from("profiles").select("nome, email").eq("id", userId).maybeSingle();
    const row: Record<string, unknown> = isRecord(data) ? data : {};
    return { id: userId, email: asString(row.email), nome: asString(row.nome) };
  } catch { return { id: userId }; }
}
