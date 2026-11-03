import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { userPlanSlug } from "@/lib/plans/capabilities";

// Imagens de referência pra geração do site do lead (até 5 por geração) —
// sobem pro bucket público `studio-refs` e entram no pipeline como fotos
// reais (hero/galeria), junto com as do Instagram/Maps. Liberado pra
// qualquer assinante: gerar site é ação de todos os planos.
const BUCKET = "studio-refs";
const MAX_IMG = 10 * 1024 * 1024; // 10 MB

async function ensureBucket() {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) await admin.storage.createBucket(BUCKET, { public: true });
  return admin;
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (session.profile?.role !== "admin") {
    const planSlug = await userPlanSlug(session.supabase, session.user.id);
    if (!planSlug) {
      return NextResponse.json({ error: "A geração de sites exige uma assinatura ativa." }, { status: 403 });
    }
  }

  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de tentar novamente." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Só imagens." }, { status: 415 });
  }
  if (file.size > MAX_IMG) {
    return NextResponse.json({ error: `Arquivo acima de ${Math.round(MAX_IMG / 1024 / 1024)} MB.` }, { status: 413 });
  }

  const admin = await ensureBucket();
  const ext = file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? "jpg";
  const path = `${session.user.id}/refs/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type, upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: "Falha no upload." }, { status: 500 });
  }
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
