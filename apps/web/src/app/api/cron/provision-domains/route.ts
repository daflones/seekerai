import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { domainAutomationReady, provisionDns, delegationReady, attachHost } from "@/lib/domains/provision";

// Provisionamento de domínios: roda a cada 15min pelo pg_cron.
// - pending_setup sem zona CF → cria zona + registros e grava os NS pro
//   admin ver no painel e delegar no registro.br
// - pending_setup com delegação já propagada → anexa no EasyPanel e ativa
export async function GET(request: NextRequest) {
  const admin = createSupabaseAdminClient();
  const key = request.headers.get("x-internal-key");
  if (key !== process.env.INTERNAL_CRON_SECRET) {
    const { data } = await admin.from("internal_kv")
      .select("value").eq("key", "cron_auth").maybeSingle();
    if (!data || key !== data.value) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }
  if (!domainAutomationReady()) {
    return NextResponse.json({ skipped: true, reason: "automação não configurada" });
  }

  const { data: rows } = await admin.from("domains")
    .select("id,desired_host,host,cf_zone_id,cf_nameservers")
    .eq("status", "pending_setup")
    .limit(20);

  const results: Record<string, string>[] = [];
  for (const d of rows ?? []) {
    const host = (d.host ?? d.desired_host).toLowerCase().replace(/^www\./, "");
    try {
      let ns = (d.cf_nameservers ?? []) as string[];
      if (!d.cf_zone_id || ns.length === 0) {
        const zone = await provisionDns(host);
        ns = zone.nameServers;
        await admin.from("domains").update({
          cf_zone_id: zone.zoneId, cf_nameservers: ns, setup_error: null,
        }).eq("id", d.id);
        results.push({ host, step: "zona criada" });
        continue;
      }
      if (!(await delegationReady(host, ns))) {
        results.push({ host, step: "aguardando delegação" });
        continue;
      }
      await attachHost(host);
      const { error } = await admin.rpc("admin_manage_domain", {
        p_domain: d.id, p_action: "activate", p_host: host,
        p_reason: "Ativação automática — delegação detectada.",
      });
      if (error) throw new Error(error.message);
      results.push({ host, step: "ativado" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "falha desconhecida";
      await admin.from("domains").update({ setup_error: msg }).eq("id", d.id);
      results.push({ host, step: `erro: ${msg}` });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
