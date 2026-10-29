import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifiedSession } from "@/lib/auth/session";
import { allowedOrigin } from "@/lib/auth/validation";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EDITOR_HEADER, editorToken, loadEditableSite, siteEditorAllowed } from "@/lib/site-editor";

// Editor visual de sites: GET devolve o documento HTML pra editar,
// POST salva a versão editada em config.html (tipo "custom" — o /site
// já serve via iframe), DELETE restaura o original gerado pela IA.
const saveSchema = z.object({ doc: z.string().min(50).max(2_000_000) });
const MAX_DOC = 2_000_000;

// Folhas de estilo locais (/_next/static/…) morrem a cada redeploy —
// o doc capturado fica autossuficiente com o CSS embutido. Links
// externos (Google Fonts etc.) continuam como <link>.
async function inlineLocalStyles(doc: string, base: string): Promise<string> {
  const tags = doc.match(/<link[^>]+rel="stylesheet"[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const href = tag.match(/href="([^"]+)"/i)?.[1];
    if (!href || /^https?:/i.test(href)) continue;
    const css = await fetch(new URL(href, base))
      .then((r) => (r.ok ? r.text() : "")).catch(() => "");
    if (css) {
      doc = doc.replace(tag, () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`);
    }
  }
  return doc;
}

// Auto-fetch da própria página /site: o container não alcança o domínio
// público (hairpin NAT), então o loopback vai primeiro. Funciona no dev
// (127.0.0.1:3000) e no standalone de produção (PORT).
async function captureSiteDoc(slug: string, origin: string) {
  const bases = [
    `http://127.0.0.1:${process.env.PORT ?? "3000"}`,
    origin,
  ];
  let doc: string | null = null;
  for (const base of [...new Set(bases)]) {
    const res = await fetch(`${base}/site/${slug}`, {
      headers: { [EDITOR_HEADER]: editorToken() },
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);
    if (res?.ok) {
      doc = await res.text().catch(() => null);
      if (doc) return inlineLocalStyles(doc, base);
    }
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (!siteEditorAllowed(session.user.email, session.profile?.role === "admin")) {
    return NextResponse.json({ error: "O editor de sites chega em breve pra todos." }, { status: 403 });
  }

  const site = await loadEditableSite(slug, session.user.id, session.profile?.role === "admin");
  if (!site) return NextResponse.json({ error: "Site não encontrado." }, { status: 404 });

  // Já editado ou gerado como HTML cru (estúdio/legado) → edita o próprio doc.
  const html = (site.config.html as string | undefined) ?? site.legacyOutput?.html;
  if (html) {
    return NextResponse.json({
      doc: html, nome: site.nome,
      edited: Boolean(site.config.html),
      canRestore: Boolean(site.config.orig),
    });
  }

  // Site renderizado por config (barbearia/beleza): captura o HTML
  // renderizado pra virar base editável. O header interno libera o gate.
  const doc = await captureSiteDoc(slug, _request.nextUrl.origin)
    .then((d) => d?.replace(/<script[\s\S]*?<\/script>/gi, "") ?? null);
  if (!doc) return NextResponse.json({ error: "Falha ao carregar o site." }, { status: 502 });
  if (doc.length > MAX_DOC) {
    return NextResponse.json({ error: "Site grande demais pra editar." }, { status: 413 });
  }
  return NextResponse.json({ doc, nome: site.nome, edited: false, canRestore: false });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (!siteEditorAllowed(session.user.email, session.profile?.role === "admin")) {
    return NextResponse.json({ error: "O editor de sites chega em breve pra todos." }, { status: 403 });
  }

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });

  const limit = await authRateLimit("app-action", session.user.id, request.headers);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Aguarde antes de tentar novamente." }, { status: 429 });
  }

  const site = await loadEditableSite(slug, session.user.id, session.profile?.role === "admin");
  if (!site) return NextResponse.json({ error: "Site não encontrado." }, { status: 404 });

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  if (site.legacyOutput) {
    // Promove o site legado pra `sites` — a partir daqui vira editável.
    const { error } = await admin.from("sites").insert({
      slug,
      tipo: "custom",
      nome: site.nome.slice(0, 150),
      lead_id: site.legacyOutput.leadId,
      config: {
        tipo: "custom", nome: site.nome, lang: "pt", owner: session.user.id,
        html: parsed.data.doc, editedAt: now,
        orig: { tipo: "custom", config: { tipo: "custom", nome: site.nome, html: site.legacyOutput.html } },
      },
      publicado: true,
      sem_expiracao: true,
    });
    if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 502 });
    return NextResponse.json({ ok: true, canRestore: true });
  }

  // Primeira edição: guarda o tipo+config originais pra restaurar.
  const orig = site.config.orig ?? { tipo: site.tipo, config: site.config };
  const { error } = await admin.from("sites")
    .update({
      tipo: "custom",
      config: { ...site.config, html: parsed.data.doc, editedAt: now, orig },
      updated_at: now,
    })
    .eq("slug", slug);
  if (error) return NextResponse.json({ error: "Falha ao salvar." }, { status: 502 });
  return NextResponse.json({ ok: true, canRestore: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!allowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });
  if (!siteEditorAllowed(session.user.email, session.profile?.role === "admin")) {
    return NextResponse.json({ error: "O editor de sites chega em breve pra todos." }, { status: 403 });
  }

  const site = await loadEditableSite(slug, session.user.id, session.profile?.role === "admin");
  if (!site) return NextResponse.json({ error: "Site não encontrado." }, { status: 404 });

  const orig = site.config.orig as { tipo: string; config: Record<string, unknown> } | undefined;
  if (!orig) return NextResponse.json({ error: "Nada pra restaurar." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("sites")
    .update({ tipo: orig.tipo, config: orig.config, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) return NextResponse.json({ error: "Falha ao restaurar." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
