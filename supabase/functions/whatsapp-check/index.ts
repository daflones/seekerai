// Verifica se um telefone tem WhatsApp ativo via Evolution API.
// Consome créditos (ação whatsapp_check — custo definido no admin).

import {
  asString,
  fail,
  httpError,
  isRecord,
  json,
  readJson,
  requirePost,
  requireUser,
  reserveAction,
  serviceClient,
  settleAction,
  sha256Hex,
} from "../_shared/common.ts";
import { requireSecret } from "../_shared/secrets.ts";

interface CheckBody {
  phone?: string;
  businessRef?: string;
  serviceSlug?: string;
  requestRef?: string;
}

Deno.serve(async (req) => {
  try {
    requirePost(req);
    const user = await requireUser(req);
    const body = await readJson<CheckBody>(req);

    const digits = asString(body.phone, 30)?.replace(/\D/g, "") ?? "";
    const service = asString(body.serviceSlug, 60);
    const businessRef = asString(body.businessRef, 300);
    const requestRef = asString(body.requestRef, 150);
    if (digits.length < 10 || digits.length > 15 || !service || !businessRef || !requestRef) {
      throw httpError(400, "Informe phone, serviceSlug, businessRef e requestRef");
    }
    const phone = digits.startsWith("55") ? digits : `55${digits}`;

    const inputHash = await sha256Hex(JSON.stringify({ phone, businessRef, service }));
    const db = serviceClient();
    const reservation = await reserveAction(db, {
      userId: user.id,
      action: "whatsapp_check",
      businessRef,
      service,
      inputHash,
      requestRef,
    });

    const base = (await requireSecret("EVOLUTION_API_URL")).replace(/\/+$/, "");
    const instance = await requireSecret("EVOLUTION_INSTANCE");
    const res = await fetch(`${base}/chat/whatsappNumbers/${instance}`, {
      method: "POST",
      headers: {
        apikey: await requireSecret("EVOLUTION_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ numbers: [phone] }),
    });
    const data = (await res.json().catch(() => [])) as unknown;
    if (!res.ok) {
      await settleAction(db, user.id, requestRef, "refunded");
      throw httpError(502, "Verificação de WhatsApp indisponível no momento");
    }
    await settleAction(db, user.id, requestRef, "completed");

    const entry = Array.isArray(data) && isRecord(data[0]) ? data[0] : {};
    return json({
      whatsapp: entry.exists === true,
      jid: typeof entry.jid === "string" ? entry.jid : null,
      numero: phone,
      creditosCobrados: reservation.cost,
    });
  } catch (err) {
    return fail(err);
  }
});
