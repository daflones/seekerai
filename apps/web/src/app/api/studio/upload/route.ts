import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Referências visuais do estúdio (imagens/vídeos que o usuário anexa no
// prompt) — sobem pro bucket público `studio-refs` e vão como contexto
// pra IA incorporar no HTML gerado.
const BUCKET = "studio-refs";
const MAX_IMG = 10 * 1024 * 1024;   // 10 MB
const MAX_VID = 60 * 1024 * 1024;   // 60 MB

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

  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de tentar novamente." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  }
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) {
    return NextResponse.json({ error: "Só imagem ou vídeo." }, { status: 415 });
  }
  const cap = isVideo ? MAX_VID : MAX_IMG;
  if (file.size > cap) {
    return NextResponse.json({ error: `Arquivo acima de ${Math.round(cap / 1024 / 1024)} MB.` }, { status: 413 });
  }

  const admin = await ensureBucket();
  const ext = file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? (isVideo ? "mp4" : "jpg");
  const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type, upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: "Falha no upload." }, { status: 502 });
  }
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, kind: isVideo ? "video" : "image" });
}
