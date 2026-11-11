import "server-only";

// Anexa/remove hosts no serviço web do EasyPanel (API tRPC com Bearer
// token). updateDomains tem semântica PUT — substitui a lista inteira —
// então sempre lemos os domínios atuais e mandamos a lista mesclada.

export interface EpConfig { url: string; token: string; project: string; service: string }
interface EpDomain { host: string; https?: boolean; port?: number; path?: string }

export function easypanelConfig(): EpConfig | null {
  const url = process.env.EASYPANEL_URL?.trim().replace(/\/+$/, "");
  const token = process.env.EASYPANEL_API_TOKEN?.trim();
  const project = process.env.EASYPANEL_PROJECT?.trim();
  const service = process.env.EASYPANEL_SERVICE?.trim();
  return url && token && project && service ? { url, token, project, service } : null;
}

function unwrap<T>(payload: unknown): T {
  const p = payload as { result?: { data?: { json?: unknown } } };
  return (p?.result?.data?.json ?? payload) as T;
}

async function epQuery<T>(cfg: EpConfig, proc: string, input: unknown): Promise<T> {
  const qs = encodeURIComponent(JSON.stringify({ json: input }));
  const res = await fetch(`${cfg.url}/api/trpc/${proc}?input=${qs}`, {
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) throw new Error(`EasyPanel ${proc} respondeu ${res.status}`);
  return unwrap<T>(await res.json().catch(() => ({})));
}

async function epMutation<T>(cfg: EpConfig, proc: string, input: unknown): Promise<T> {
  const res = await fetch(`${cfg.url}/api/trpc/${proc}`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
  if (!res.ok) throw new Error(`EasyPanel ${proc} respondeu ${res.status}`);
  return unwrap<T>(await res.json().catch(() => ({})));
}

async function listDomains(cfg: EpConfig): Promise<EpDomain[]> {
  const svc = await epQuery<Record<string, unknown>>(cfg, "services.app.inspectService", {
    projectName: cfg.project, serviceName: cfg.service,
  });
  const domains = (svc?.domains ?? (svc?.service as Record<string, unknown> | undefined)?.domains) as EpDomain[] | undefined;
  return Array.isArray(domains) ? domains : [];
}

// Anexa o host clonando a config (porta/https/path) do domínio principal.
export async function attachServiceDomain(host: string): Promise<void> {
  const cfg = easypanelConfig();
  if (!cfg) throw new Error("EasyPanel não configurado.");
  const domains = await listDomains(cfg);
  if (domains.some((d) => d.host === host)) return;
  const ref = domains.find((d) => d.host === cfg.service) ?? domains[0];
  domains.push({ host, https: ref?.https ?? true, port: ref?.port ?? 3000, path: ref?.path ?? "/" });
  await epMutation(cfg, "services.app.updateDomains", {
    projectName: cfg.project, serviceName: cfg.service, domains,
  });
}

export async function detachServiceDomain(host: string): Promise<void> {
  const cfg = easypanelConfig();
  if (!cfg) return;
  const domains = await listDomains(cfg);
  const next = domains.filter((d) => d.host !== host);
  if (next.length === domains.length) return;
  await epMutation(cfg, "services.app.updateDomains", {
    projectName: cfg.project, serviceName: cfg.service, domains: next,
  });
}
