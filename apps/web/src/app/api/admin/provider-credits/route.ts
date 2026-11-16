import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type ProviderCredit = {
  provider: "serper" | "scrapecreators" | "openrouter";
  label: string;
  status: "ok" | "warn" | "danger" | "off" | "error";
  value: string;
  detail?: string;
};

const TIMEOUT = 8000;

async function getJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

function serperStatus(balance: number): ProviderCredit["status"] {
  if (balance <= 0) return "danger";
  if (balance <= 200) return "warn";
  return "ok";
}

async function serperCredits(): Promise<ProviderCredit[]> {
  const keys = Object.keys(process.env)
    .filter((k) => /^SERPER_API_KEY(_\d+)?$/.test(k))
    .sort();
  return Promise.all(keys.map(async (envName) => {
    const label = `Serper · ${envName.replace("SERPER_API_KEY", "key ") || "key 1"}`;
    const key = process.env[envName];
    if (!key) return { provider: "serper", label, status: "off", value: "não configurada" };
    try {
      const j = await getJson("https://google.serper.dev/account", { "X-API-KEY": key });
      const balance = Number(j.balance ?? NaN);
      if (!Number.isFinite(balance)) throw new Error("resposta inválida");
      return {
        provider: "serper", label,
        status: serperStatus(balance),
        value: `${balance.toLocaleString("pt-BR")} créditos`,
        detail: `rate limit ${j.rateLimit ?? "?"} req/s`,
      };
    } catch {
      return { provider: "serper", label, status: "error", value: "falha ao consultar" };
    }
  }));
}

async function scrapeCreatorsCredits(): Promise<ProviderCredit[]> {
  const keys = Object.keys(process.env)
    .filter((k) => /^SCRAPECREATORS_API_KEY(_\d+)?$/.test(k))
    .sort();
  return Promise.all(keys.map(async (envName) => {
    const label = `ScrapeCreators · ${envName === "SCRAPECREATORS_API_KEY" ? "key 1" : envName.replace("SCRAPECREATORS_API_KEY_", "key ")}`;
    const key = process.env[envName];
    if (!key) return { provider: "scrapecreators", label, status: "off", value: "não configurada" };
    try {
      const j = await getJson("https://api.scrapecreators.com/v1/account/credit-balance",
        { "x-api-key": key });
      const credits = Number(j.creditCount ?? j.credits_remaining ?? NaN);
      if (!Number.isFinite(credits)) throw new Error("resposta inválida");
      const status = credits <= 0 ? "danger" : credits <= 100 ? "warn" : "ok";
      return { provider: "scrapecreators", label, status, value: `${credits.toLocaleString("pt-BR")} créditos` };
    } catch {
      return { provider: "scrapecreators", label, status: "error", value: "falha ao consultar" };
    }
  }));
}

async function openRouterCredits(): Promise<ProviderCredit[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return [{ provider: "openrouter", label: "OpenRouter", status: "off", value: "não configurada" }];
  }
  try {
    const j = await getJson("https://openrouter.ai/api/v1/key",
      { Authorization: `Bearer ${key}` });
    const d = (j.data ?? {}) as Record<string, unknown>;
    const usage = Number(d.usage ?? 0);
    const limit = d.limit == null ? null : Number(d.limit);
    const remaining = d.limit_remaining == null ? null : Number(d.limit_remaining);
    const fmtUsd = (n: number) => `$${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
    let status: ProviderCredit["status"] = "ok";
    let value = `uso ${fmtUsd(usage)}`;
    let detail = `hoje ${fmtUsd(Number(d.usage_daily ?? 0))} · semana ${fmtUsd(Number(d.usage_weekly ?? 0))}`;
    if (remaining != null && Number.isFinite(remaining)) {
      status = remaining <= 0 ? "danger" : remaining <= 5 ? "warn" : "ok";
      value = `${fmtUsd(remaining)} restantes`;
      detail = `limite ${limit != null ? fmtUsd(limit) : "?"} · uso ${fmtUsd(usage)}`;
    } else if (limit == null) {
      detail += " · sem teto por key";
    }
    return [{ provider: "openrouter", label: "OpenRouter", status, value, detail }];
  } catch {
    return [{ provider: "openrouter", label: "OpenRouter", status: "error", value: "falha ao consultar" }];
  }
}

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }

  const [serper, scrape, openrouter] = await Promise.all([
    serperCredits(), scrapeCreatorsCredits(), openRouterCredits(),
  ]);
  const credits = [...serper, ...scrape, ...openrouter];
  return NextResponse.json({ credits, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } });
}
