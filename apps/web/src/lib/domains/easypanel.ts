import "server-only";

// Anexa/remove hosts no serviço web do EasyPanel (API tRPC, Bearer token).
// Domínios são entidades próprias (domains.*): cada host customizado entra
// como apex + www clonando a config do domínio principal do serviço —
// Traefik passa a rotear o host e o middleware do app resolve o slug.

export interface EpConfig { url: string; token: string; project: string; service: string }

interface EpDomain {
  id: string;
  host: string;
  https: boolean;
  certificateResolver: string;
  middlewares: unknown[];
  path: string;
  wildcard: boolean;
  destinationType: string;
  serviceDestination?: { projectName: string; serviceName: string; port: number; protocol: string; path: string };
}

export function easypanelConfig(): EpConfig | null {
  const url = process.env.EASYPANEL_URL?.trim().replace(/\/+$/, "");
  const token = process.env.EASYPANEL_API_TOKEN?.trim();
  const project = process.env.EASYPANEL_PROJECT?.trim();
  const service = process.env.EASYPANEL_SERVICE?.trim();
  return url && token && project && service ? { url, token, project, service } : null;
}

function unwrap<T>(payload: unknown): T {
  const p = payload as { result?: { data?: { json?: unknown } }; json?: unknown };
  return (p?.result?.data?.json ?? p?.json ?? payload) as T;
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
  const list = await epQuery<EpDomain[]>(cfg, "domains.listDomains", {
    projectName: cfg.project, serviceName: cfg.service,
  });
  const all = Array.isArray(list) ? list : [];
  return all.filter((d) =>
    d.destinationType === "service" &&
    d.serviceDestination?.projectName === cfg.project &&
    d.serviceDestination?.serviceName === cfg.service);
}

const apexWww = (host: string) => [host, `www.${host}`];
const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`;

// Anexa apex + www clonando a config do domínio principal do serviço.
export async function attachServiceDomain(host: string): Promise<void> {
  const cfg = easypanelConfig();
  if (!cfg) throw new Error("EasyPanel não configurado.");
  const domains = await listDomains(cfg);
  const ref = domains.find((d) => !d.host.endsWith(".easypanel.host")) ?? domains[0];
  if (!ref?.serviceDestination) throw new Error("Serviço sem domínio de referência.");
  const missing = apexWww(host).filter((h) => !domains.some((d) => d.host === h));
  for (const h of missing) {
    await epMutation(cfg, "domains.createDomain", {
      id: newId(),
      destinationType: "service",
      host: h,
      https: ref.https,
      certificateResolver: ref.certificateResolver ?? "",
      middlewares: ref.middlewares ?? [],
      path: ref.path ?? "/",
      wildcard: false,
      serviceDestination: ref.serviceDestination,
    });
  }
}

export async function detachServiceDomain(host: string): Promise<void> {
  const cfg = easypanelConfig();
  if (!cfg) return;
  const drop = new Set(apexWww(host));
  for (const d of await listDomains(cfg)) {
    if (drop.has(d.host)) {
      await epMutation(cfg, "domains.deleteDomain", { id: d.id }).catch(() => null);
    }
  }
}
