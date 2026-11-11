import "server-only";

// Orquestra o provisionamento do domínio do cliente:
// 1. zona no Cloudflare + registros (apex/www → app, proxied)
// 2. admin delega os nameservers no registro.br (passo manual)
// 3. delegação detectada via RDAP → host anexado no EasyPanel → activate

import { cloudflareConfig, ensureZone, applyZoneSettings, upsertDomainRecords, deleteZone } from "./cloudflare";
import { easypanelConfig, attachServiceDomain, detachServiceDomain } from "./easypanel";
import { lookupNameservers } from "./rdap";

export function domainAutomationReady(): boolean {
  return Boolean(cloudflareConfig() && easypanelConfig());
}

// Zona + DNS + settings. Idempotente: reutiliza zona existente.
export async function provisionDns(host: string): Promise<{ zoneId: string; nameServers: string[] }> {
  const zone = await ensureZone(host);
  await applyZoneSettings(zone.zoneId);
  await upsertDomainRecords(zone.zoneId, host);
  return zone;
}

// Delegação propagou quando TODOS os NS esperados aparecem no RDAP.
export async function delegationReady(host: string, expectedNs: string[]): Promise<boolean> {
  const delegated = await lookupNameservers(host);
  if (delegated.length === 0 || expectedNs.length === 0) return false;
  const expected = expectedNs.map((n) => n.toLowerCase().replace(/\.$/, ""));
  return expected.every((n) => delegated.includes(n));
}

// Anexa o host ao serviço web — Traefik emite o cert em seguida.
export async function attachHost(host: string): Promise<void> {
  await attachServiceDomain(host);
}

export async function cleanupProvision(cfZoneId: string | null, host: string | null): Promise<void> {
  if (host) await detachServiceDomain(host).catch(() => null);
  if (cfZoneId) await deleteZone(cfZoneId).catch(() => null);
}
