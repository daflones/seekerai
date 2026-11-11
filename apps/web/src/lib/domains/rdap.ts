import "server-only";

export const HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const UA = { "User-Agent": "SeekerAi/1.0 (+https://seekerai.digital)", Accept: "application/rdap+json, application/json" };

// rdap.org bloqueia requests sem User-Agent (403). .br tem RDAP
// próprio autoritativo; .com/.net consultam o registry direto.
function rdapUrls(host: string): string[] {
  const urls: string[] = [];
  if (host.endsWith(".br")) urls.push(`https://rdap.registro.br/domain/${encodeURIComponent(host)}`);
  else if (host.endsWith(".com")) urls.push(`https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(host)}`);
  else if (host.endsWith(".net")) urls.push(`https://rdap.verisign.com/net/v1/domain/${encodeURIComponent(host)}`);
  else if (host.endsWith(".org")) urls.push(`https://rdap.publicinterestregistry.org/rdap/domain/${encodeURIComponent(host)}`);
  urls.push(`https://rdap.org/domain/${encodeURIComponent(host)}`);
  return urls;
}

// Disponibilidade via RDAP (rdap.org delega ao registro do TLD — .br
// resolve no registro.br). 404 = livre; 200 = registrado; resto = incerto.
export async function checkDomainAvailable(host: string): Promise<{
  host: string;
  available: boolean | null;
  expiresAt: string | null;
}> {
  for (const url of rdapUrls(host)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: UA });
      if (res.status === 404) return { host, available: true, expiresAt: null };
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          events?: { eventAction?: string; eventDate?: string }[];
        };
        const expiry = data.events?.find((e) => e.eventAction === "expiration")?.eventDate ?? null;
        return { host, available: false, expiresAt: expiry };
      }
      // Outros status (403/429/5xx): tenta o próximo registry.
    } catch { /* timeout/rede — tenta o próximo */ }
  }
  return { host, available: null, expiresAt: null };
}

// Nameservers delegados do domínio (RDAP) — usado pra detectar quando o
// admin apontou o domínio pros NS da zona do Cloudflare.
export async function lookupNameservers(host: string): Promise<string[]> {
  for (const url of rdapUrls(host)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: UA });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => ({}))) as {
        nameservers?: { ldhName?: string }[];
      };
      const ns = (data.nameservers ?? [])
        .map((n) => n.ldhName?.toLowerCase().replace(/\.$/, ""))
        .filter((n): n is string => Boolean(n));
      if (ns.length > 0) return ns;
    } catch { /* timeout/rede — tenta o próximo */ }
  }
  return [];
}

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "a", "o", "the"]);

// Gera candidatos de domínio a partir do nome do estabelecimento:
// nome-sem-hifen.com.br/.com e nome-com-hifen.com.br/.com, mais uma
// variante curta quando o nome é longo.
export function domainCandidates(nome: string, max = 6): string[] {
  const base = nome.split("|")[0].split(/\s[-–—]\s/)[0];
  const words = base
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[''ʼ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
  if (words.length === 0) return [];

  const joined = words.join("");
  const slug = joined.length > 30 ? words.slice(0, 3).join("") : joined;
  const dashed = (joined.length > 30 ? words.slice(0, 3) : words).join("-");

  const labels = new Set<string>();
  labels.add(slug);
  if (dashed !== slug) labels.add(dashed);
  if (joined.length > 14 && words.length > 1) labels.add(words.slice(0, 2).join(""));
  if (joined.length > 20 && words.length > 2) labels.add(words.slice(0, 3).join(""));

  const hosts: string[] = [];
  for (const label of labels) {
    if (label.length < 3 || label.length > 40) continue;
    hosts.push(`${label}.com.br`);
    if (hosts.length < max) hosts.push(`${label}.com`);
  }
  return hosts.slice(0, max);
}
