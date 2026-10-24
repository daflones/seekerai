// Boas-vindas de cadastro: WhatsApp pro usuário novo (mensagem escrita por IA)
// + ping pro dono. Só aceita chamada interna com a service role key — o
// gateway roda sem JWT (verify_jwt=false) e a autenticação é manual aqui.
import {
  asString, fail, httpError, isRecord, json, readJson, requirePost,
} from "../_shared/common.ts";
import { getSecret } from "../_shared/secrets.ts";
import { notifySale, sendWhatsAppTo, welcomeCopy } from "../_shared/notify.ts";
import { toE164 } from "../_shared/phone.ts";

Deno.serve(async (req) => {
  try {
    requirePost(req);
    const expected = await getSecret("INTERNAL_CRON_SECRET");
    if (!expected || req.headers.get("x-internal-key") !== expected) {
      throw httpError(401, "Não autorizado");
    }

    const body = await readJson<unknown>(req);
    if (!isRecord(body)) throw httpError(400, "Payload inválido");
    const nome = asString(body.nome, 120);
    const email = asString(body.email, 200);
    const phone = toE164(asString(body.telefone, 40));

    let sent = false;
    if (phone) {
      const msg = await welcomeCopy(nome);
      await sendWhatsAppTo(phone, msg);
      sent = true;
    }

    await notifySale({
      tipo: "cadastro",
      descricao: `Novo cadastro na plataforma${nome ? ` — ${nome}` : ""}${sent ? " (boas-vindas enviadas no WhatsApp)" : ""}`,
      usuario: { nome, email },
    });

    return json({ sent });
  } catch (err) {
    return fail(err);
  }
});
