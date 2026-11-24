import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { genServiceUrl } from "@/lib/gen-service";

export const dynamic = "force-dynamic";

type ProviderCredit = {
  provider: string;
  label: string;
  status: "ok" | "warn" | "danger" | "off" | "error";
  value: string;
  detail?: string;
};

const TIMEOUT = 8000;

// Fallback local — usado só quando o gen está fora do ar.
// As vars do web podem estar incompletas (keys 5-7 estão no gen),
// mas evita que o card quebre inteiramente.
async function localFallback(): Promise<ProviderCredit[]> {
  const keys = Object.keys(process.env)
    .filter((k) => /^SERPER_API_KEY(_\d+)?$/.test(k))
    .sort();
  const serper = await Promise.all(keys.map(async (envName) => {
    const label = `Serper · ${envName.replace("SERPER_API_KEY", "key ") || "key 1"}`;
    const key = process.env[envName];
    if (!key) return { provider: "serper", label, status: "off" as const, value: "não configurada" };
    try {
      const r = await fetch("https://google.serper.dev/account", {
        headers: { "X-API-KEY": key },
        signal: AbortSignal.timeout(TIMEOUT),
        cache: "no-store",
      });
      if (!r.ok) throw new Error();
      const j = await r.json();
      const balance = Number(j.balance ?? NaN);
      if (!Number.isFinite(balance)) throw new Error();
      const status: ProviderCredit["status"] = balance <= 0 ? "danger" : balance <= 200 ? "warn" : "ok";
      return { provider: "serper", label, status, value: `${balance.toLocaleString("pt-BR")} créditos` };
    } catch {
      return { provider: "serper", label, status: "error" as const, value: "falha ao consultar" };
    }
  }));

  const scKey = process.env.SCRAPECREATORS_API_KEY;
  let scrape: ProviderCredit[] = [];
  if (scKey) {
    try {
      const r = await fetch("https://api.scrapecreators.com/v1/account/credit-balance", {
        headers: { "x-api-key": scKey },
        signal: AbortSignal.timeout(TIMEOUT),
        cache: "no-store",
      });
      if (r.ok) {
        const j = await r.json();
        const credits = Number(j.creditCount ?? j.credits_remaining ?? NaN);
        if (Number.isFinite(credits)) {
          const status: ProviderCredit["status"] = credits <= 0 ? "danger" : credits <= 100 ? "warn" : "ok";
          scrape = [{ provider: "scrapecreators", label: "ScrapeCreators · key 1", status, value: `${credits.toLocaleString("pt-BR")} créditos` }];
        }
      }
    } catch { /* silencioso */ }
  } else {
    const status: ProviderCredit["status"] = "off";
    scrape = [{ provider: "scrapecreators", label: "ScrapeCreators · key 1", status, value: "não configurada" }];
  }

  const orKey = process.env.OPENROUTER_API_KEY;
  let openrouter: ProviderCredit[] = [];
  if (orKey) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${orKey}` },
        signal: AbortSignal.timeout(TIMEOUT),
        cache: "no-store",
      });
      if (r.ok) {
        const j = await r.json();
        const d = (j.data ?? {}) as Record<string, unknown>;
        const usage = Number(d.usage ?? 0);
        const remaining = d.limit_remaining == null ? null : Number(d.limit_remaining);
        const fmtUsd = (n: number) => `$${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
        if (remaining != null && Number.isFinite(remaining)) {
          const status: ProviderCredit["status"] = remaining <= 0 ? "danger" : remaining <= 5 ? "warn" : "ok";
          openrouter = [{ provider: "openrouter", label: "OpenRouter", status, value: `${fmtUsd(remaining)} restantes`, detail: `uso ${fmtUsd(usage)}` }];
        } else {
          const status: ProviderCredit["status"] = "ok";
          openrouter = [{ provider: "openrouter", label: "OpenRouter", status, value: `uso ${fmtUsd(usage)}` }];
        }
      }
    } catch { /* silencioso */ }
  } else {
    const status: ProviderCredit["status"] = "off";
    openrouter = [{ provider: "openrouter", label: "OpenRouter", status, value: "não configurada" }];
  }

  return [...serper, ...scrape, ...openrouter];
}

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso administrativo necessário." }, { status: 403 });
  }

  const genBase = genServiceUrl();
  let credits: ProviderCredit[] = [];
  let at = new Date().toISOString();

  if (genBase) {
    try {
      const r = await fetch(`${genBase}/provider-credits`, {
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (r.ok) {
        const body = await r.json() as { credits: ProviderCredit[]; at: string };
        credits = body.credits;
        at = body.at;
      } else {
        console.warn("[provider-credits] gen respondeu", r.status, "— usando fallback local");
        credits = await localFallback();
      }
    } catch (err) {
      console.warn("[provider-credits] gen indisponível:", err instanceof Error ? err.message : err, "— usando fallback local");
      credits = await localFallback();
    }
  } else {
    console.warn("[provider-credits] GEN_SERVICE_URL não configurada — usando fallback local");
    credits = await localFallback();
  }

  return NextResponse.json({ credits, at }, { headers: { "Cache-Control": "no-store" } });
}
