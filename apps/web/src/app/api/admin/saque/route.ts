import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { decryptSecret } from "@/lib/security/encryption";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addCents, emptyTotals, payCurrency, totalsToUnits, type CurTotals, type PayCurrency } from "@/lib/admin/money";

// Painel financeiro: saldo/sacável vem só do MercosulPay (PIX). A receita do
// Stripe (cartão) é separada nos rendimentos — não entra no saque.

const mpBase = () =>
  (process.env.MERCOSULPAY_API_URL ?? "https://mercosulpay.com/api/public/v1").replace(/\/+$/, "");

async function mpKey(): Promise<string | null> {
  if (process.env.MERCOSULPAY_API_KEY) return process.env.MERCOSULPAY_API_KEY;
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.from("integration_secrets")
      .select("valor_criptografado").eq("provedor", "edge")
      .eq("nome", "MERCOSULPAY_API_KEY").maybeSingle();
    if (data?.valor_criptografado) {
      return decryptSecret(data.valor_criptografado, "edge:MERCOSULPAY_API_KEY");
    }
  } catch { /* indisponível */ }
  return null;
}

async function mpFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = await mpKey();
  if (!key) throw new Error("MERCOSULPAY_API_KEY não configurada");
  return fetch(`${mpBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
}

function maskKey(key: string): string {
  if (key.length <= 6) return "•••";
  return `${key.slice(0, 3)}••••${key.slice(-3)}`;
}

async function requireAdmin() {
  const session = await verifiedSession();
  if (!session) return { error: NextResponse.json({ error: "Entre novamente." }, { status: 401 }) };
  if (!session.profile || session.profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 }) };
  }
  return { session };
}

const chaveSchema = z.object({
  label: z.string().trim().min(1).max(80),
  pix_key: z.string().trim().min(3).max(200),
  pix_key_type: z.enum(["cpf", "cnpj", "email", "phone", "evp", "emv"]),
  recipient_document: z.string().trim().min(11).max(20).optional().or(z.literal("")),
});

const actionSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("salvar-chave"), chave: chaveSchema }),
  z.object({ acao: z.literal("remover-chave"), id: z.string().uuid() }),
  z.object({
    acao: z.literal("sacar"),
    amount: z.number().positive().max(1_000_000),
    keyId: z.string().uuid().optional(),
    chave: chaveSchema.omit({ label: true }).optional(),
  }),
]);

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const admin = createSupabaseAdminClient();

  const [keys, withdrawals, payments, subs] = await Promise.all([
    admin.from("admin_pix_keys").select("id,label,pix_key,pix_key_type,recipient_document,created_at")
      .order("created_at", { ascending: false }),
    admin.from("admin_withdrawals")
      .select("id,amount,pix_key,pix_key_type,status,provider_ref,erro,created_at")
      .order("created_at", { ascending: false }).limit(50),
    admin.from("payments").select("provider,method,amount_cents,currency,metadata").eq("status", "paid").limit(5000),
    admin.from("subscriptions").select("status,currency,billing_months, plans(preco_centavos,intl_prices)")
      .in("status", ["active", "past_due"]),
  ]);

  let saldo: number | null = null;
  let saldoAt: string | null = null;
  try {
    const res = await mpFetch("/balance");
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      // API v1 devolve {"brl":147.5,"btc":0,"usdt":0,"updated_at":…}
      const raw = data.brl ?? data.balance ?? data.available ?? data.amount;
      if (typeof raw === "number") saldo = raw;
      else if (typeof raw === "string" && !Number.isNaN(Number(raw))) saldo = Number(raw);
      if (typeof data.updated_at === "string") saldoAt = data.updated_at;
    }
  } catch { /* saldo indisponível sem a chave */ }

  // Receita por moeda: PIX é sempre BRL (MercosulPay); cartão pode vir em
  // USD/EUR/GBP via Stripe — cada moeda soma na sua própria chave.
  const pixCents: CurTotals = emptyTotals();
  const cartaoCents: CurTotals = emptyTotals();
  for (const p of payments.data ?? []) {
    const cur = payCurrency(p);
    const cents = Number(p.amount_cents) || 0;
    if (p.method === "pix") addCents(pixCents, "brl", cents);
    else addCents(cartaoCents, cur, cents);
  }

  // Projeção por moeda: assinatura cobra na moeda dela — BRL usa o preço
  // do plano, internacional usa o intl_prices configurado.
  const mrrCents: CurTotals = emptyTotals();
  for (const s of subs.data ?? []) {
    const cur = ((s.currency as string | null) ?? "brl").toLowerCase() as PayCurrency;
    const plano = s.plans as unknown as { preco_centavos: number; intl_prices?: Record<string, number> } | null;
    const months = Number((s as { billing_months?: number }).billing_months) || 1;
    const factor = months === 12 ? 0.8 : months === 3 ? 0.9 : 1;
    const base = cur === "brl"
      ? (plano?.preco_centavos ?? 0)
      : (plano?.intl_prices?.[cur] ?? 0);
    addCents(mrrCents, cur === "brl" || cur === "usd" || cur === "eur" || cur === "gbp" ? cur : "brl",
      Math.round(base * factor));
  }

  return NextResponse.json({
    saldo,
    saldoAt,
    receita: { cartao: totalsToUnits(cartaoCents), pix: pixCents.brl / 100 },
    previsao: {
      proximoMes: totalsToUnits(mrrCents),
      trimestre: totalsToUnits({ brl: mrrCents.brl * 3, usd: mrrCents.usd * 3, eur: mrrCents.eur * 3, gbp: mrrCents.gbp * 3 }),
      assinaturas: subs.data?.length ?? 0,
    },
    chaves: (keys.data ?? []).map((k) => ({
      id: k.id,
      label: k.label,
      pixKeyMask: maskKey(k.pix_key),
      pix_key_type: k.pix_key_type,
      hasDocument: Boolean(k.recipient_document),
    })),
    saques: (withdrawals.data ?? []).map((w) => ({
      id: w.id,
      amount: w.amount,
      pixKeyMask: maskKey(w.pix_key),
      pix_key_type: w.pix_key_type,
      status: w.status,
      erro: w.erro,
      created_at: w.created_at,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  }
  const { session, error: authError } = await requireAdmin();
  if (authError) return authError;

  const raw = await request.text().catch(() => "");
  if (raw.length > 8_192) return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revise os campos." }, { status: 400 });
  }
  const limit = await authRateLimit("admin-saque", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de tentar novamente." }, { status: 429 });
  }
  const admin = createSupabaseAdminClient();
  const body = parsed.data;

  if (body.acao === "salvar-chave") {
    const { error } = await admin.from("admin_pix_keys").insert({
      label: body.chave.label,
      pix_key: body.chave.pix_key,
      pix_key_type: body.chave.pix_key_type,
      recipient_document: body.chave.recipient_document || null,
      created_by: session.user.id,
    });
    if (error) return NextResponse.json({ error: "Não foi possível salvar a chave." }, { status: 400 });
    return NextResponse.json({ message: "Chave PIX salva." });
  }

  if (body.acao === "remover-chave") {
    await admin.from("admin_pix_keys").delete().eq("id", body.id);
    return NextResponse.json({ message: "Chave removida." });
  }

  // Saque: registra a intenção primeiro — o id vira o reference_id idempotente.
  let chave: { pix_key: string; pix_key_type: string; recipient_document: string | null };
  if (body.keyId) {
    const { data: saved } = await admin.from("admin_pix_keys")
      .select("pix_key,pix_key_type,recipient_document").eq("id", body.keyId).maybeSingle();
    if (!saved) return NextResponse.json({ error: "Chave não encontrada." }, { status: 404 });
    chave = {
      pix_key: saved.pix_key,
      pix_key_type: saved.pix_key_type,
      recipient_document: saved.recipient_document,
    };
  } else if (body.chave) {
    chave = {
      pix_key: body.chave.pix_key,
      pix_key_type: body.chave.pix_key_type,
      recipient_document: body.chave.recipient_document || null,
    };
  } else {
    return NextResponse.json({ error: "Escolha uma chave salva ou informe uma nova." }, { status: 400 });
  }
  // Telefone/e-mail/aleatória exigem documento do recebedor (regra do banco).
  if (["phone", "email", "evp"].includes(chave.pix_key_type) && !chave.recipient_document) {
    return NextResponse.json(
      { error: "Chave de telefone, e-mail ou aleatória exige o CPF/CNPJ do recebedor." },
      { status: 400 },
    );
  }

  const { data: withdrawal, error: wErr } = await admin.from("admin_withdrawals").insert({
    amount: body.amount,
    pix_key: chave.pix_key,
    pix_key_type: chave.pix_key_type,
    recipient_document: chave.recipient_document,
    created_by: session.user.id,
  }).select("id").single();
  if (wErr || !withdrawal) {
    return NextResponse.json({ error: "Não foi possível registrar o saque." }, { status: 400 });
  }

  try {
    const res = await mpFetch("/pix/withdrawals", {
      method: "POST",
      body: JSON.stringify({
        amount: body.amount,
        pix_key: chave.pix_key,
        pix_key_type: chave.pix_key_type,
        ...(chave.recipient_document ? { recipient_document: chave.recipient_document } : {}),
        reference_id: withdrawal.id,
        description: "Saque SeekerAi",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = typeof (data as { error?: { message?: string } }).error?.message === "string"
        ? (data as { error: { message: string } }).error.message
        : "MercosulPay recusou o saque.";
      await admin.from("admin_withdrawals")
        .update({ status: "falhou", erro: msg }).eq("id", withdrawal.id);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    await admin.from("admin_withdrawals").update({
      status: "concluido",
      provider_ref: typeof data.id === "string" ? data.id : null,
    }).eq("id", withdrawal.id);
    return NextResponse.json({ message: "Saque enviado via PIX.", id: withdrawal.id });
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("MERCOSULPAY_API_KEY")
      ? "Configure a chave do MercosulPay primeiro."
      : "MercosulPay indisponível no momento.";
    await admin.from("admin_withdrawals")
      .update({ status: "falhou", erro: msg }).eq("id", withdrawal.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
