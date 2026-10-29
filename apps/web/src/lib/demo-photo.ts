import "server-only";
import { createHmac } from "node:crypto";

// Assinatura das referências de foto da demo pública: /api/demo/foto
// só resolve refs que vieram com o sig emitido por /api/demo/search.
const secret = () =>
  process.env.AUTH_RATE_LIMIT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function signPhotoRef(ref: string): string {
  return createHmac("sha256", secret()).update(`seeker-demo-foto:${ref}`)
    .digest("hex").slice(0, 16);
}
