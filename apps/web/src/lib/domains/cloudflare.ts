import "server-only";

// Provisionamento de DNS no Cloudflare: cria a zona do domínio do cliente,
// aponta apex + www pro app (proxied — TLS na borda, origem oculta) e lê
// os nameservers que o admin delega no registro.br.

const API = "https://api.cloudflare.com/client/v4";

export interface CfConfig { token: string; account: string }

export function cloudflareConfig(): CfConfig | null {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  return token && account ? { token, account } : null;
}

async function cf<T>(cfg: CfConfig, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    result?: T;
    errors?: { message?: string }[];
  };
  if (!res.ok || data.success === false) {
    throw new Error(data.errors?.[0]?.message || `Cloudflare respondeu ${res.status}`);
  }
  return data.result as T;
}

interface CfZone { id: string; name: string; name_servers?: string[] }

// Cria (ou adota, se já existir na conta) a zona full do domínio.
export async function ensureZone(host: string): Promise<{ zoneId: string; nameServers: string[] }> {
  const cfg = cloudflareConfig();
  if (!cfg) throw new Error("Cloudflare não configurado.");
  const found = await cf<CfZone[]>(cfg, `/zones?name=${encodeURIComponent(host)}&account.id=${cfg.account}`);
  const zone = found[0] ?? await cf<CfZone>(cfg, "/zones", {
    method: "POST",
    body: JSON.stringify({ name: host, account: { id: cfg.account }, type: "full", jump_start: false }),
  });
  return { zoneId: zone.id, nameServers: zone.name_servers ?? [] };
}

// Full (não strict): aceita o cert do Traefik enquanto o LE emite. Always
// HTTPS mantém o redirect na borda.
export async function applyZoneSettings(zoneId: string): Promise<void> {
  const cfg = cloudflareConfig();
  if (!cfg) return;
  const set = (setting: string, value: string) =>
    cf<unknown>(cfg, `/zones/${zoneId}/settings/${setting}`, {
      method: "PATCH", body: JSON.stringify({ value }),
    }).catch(() => null);
  await set("ssl", "full");
  await set("always_use_https", "on");
}

// Host de destino do CNAME — o domínio do próprio app.
function targetHost(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "https://seekerai.digital";
  try { return new URL(url).hostname; } catch { return "seekerai.digital"; }
}

interface CfRecord { id: string; type: string; name: string }

async function upsertRecord(
  cfg: CfConfig, zoneId: string, existing: CfRecord[],
  record: { type: string; name: string; content: string },
): Promise<void> {
  const body = { ...record, proxied: true, ttl: 1, comment: "SeekerAi — domínio do cliente" };
  const found = existing.find((r) => r.type === record.type && r.name === record.name);
  const path = `/zones/${zoneId}/dns_records${found ? `/${found.id}` : ""}`;
  await cf(cfg, path, { method: found ? "PUT" : "POST", body: JSON.stringify(body) });
}

// apex → app (CNAME achatado pelo CF) + www → apex. Ambos proxied.
export async function upsertDomainRecords(zoneId: string, host: string): Promise<void> {
  const cfg = cloudflareConfig();
  if (!cfg) throw new Error("Cloudflare não configurado.");
  const target = targetHost();
  const existing = await cf<CfRecord[]>(
    cfg, `/zones/${zoneId}/dns_records?per_page=100&name.contains=${encodeURIComponent(host)}`);
  await upsertRecord(cfg, zoneId, existing, { type: "CNAME", name: host, content: target });
  await upsertRecord(cfg, zoneId, existing, { type: "CNAME", name: `www.${host}`, content: host });
}

export async function deleteZone(zoneId: string): Promise<void> {
  const cfg = cloudflareConfig();
  if (!cfg) return;
  await cf(cfg, `/zones/${zoneId}`, { method: "DELETE" });
}
