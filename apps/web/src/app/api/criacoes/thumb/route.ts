import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  const { data } = await session.supabase.from("lead_outputs")
    .select("tipo,conteudo").eq("id", id).eq("user_id", session.user.id).maybeSingle();
  if (!data || data.tipo !== "generate_image") {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  const conteudo = data.conteudo as string;
  const dataUrl = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(conteudo);
  if (dataUrl) {
    const bytes = Buffer.from(dataUrl[2].replace(/\s/g, ""), "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": dataUrl[1],
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
  if (/^https?:\/\//i.test(conteudo)) {
    return NextResponse.redirect(conteudo);
  }
  return NextResponse.json({ error: "Formato de imagem desconhecido." }, { status: 404 });
}
