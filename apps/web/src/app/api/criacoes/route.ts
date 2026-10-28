import { NextResponse, type NextRequest } from "next/server";
import { verifiedSession } from "@/lib/auth/session";

const MAX_SIZE = 24;

export interface CreationItem {
  id: string;
  kind: "site" | "app" | "image" | "text";
  sub: string;
  title: string;
  leadId: string | null;
  leadName: string | null;
  siteSlug: string | null;
  status: "done" | "running" | "error";
  erro: string | null;
  model: string | null;
  excerpt: string | null;
  createdAt: string;
}

interface OutputRow { id: string; lead_id: string; tipo: string; modelo: string | null; created_at: string }
interface LeadRow { id: string; nome: string | null; dados: unknown }
interface ProjectRow {
  id: string; nome: string | null; target: string; status: string;
  erro: string | null; site_slug: string | null; created_at: string;
}

const TEXT_KINDS = new Set(["sales_reply", "deep_strategy", "image_prompt"]);
const VALID_TYPES = new Set(["all", "site", "app", "image", "text"]);

export async function GET(request: NextRequest) {
  const session = await verifiedSession();
  if (!session) return NextResponse.json({ error: "Entre novamente." }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const type = VALID_TYPES.has(sp.get("type") ?? "") ? sp.get("type")! : "all";
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const leadId = sp.get("lead") ?? "";
  const page = Math.max(1, Math.floor(Number(sp.get("page"))) || 1);
  const size = Math.min(MAX_SIZE, Math.max(6, Math.floor(Number(sp.get("size"))) || 12));

  const [outputsRes, leadsRes, projectsRes] = await Promise.all([
    session.supabase.from("lead_outputs")
      .select("id,lead_id,tipo,modelo,created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false }).limit(1000),
    session.supabase.from("leads")
      .select("id,nome,dados")
      .eq("user_id", session.user.id).limit(2000),
    session.supabase.from("studio_projects")
      .select("id,nome,target,status,erro,site_slug,created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false }).limit(500),
  ]);

  const leadById = new Map<string, LeadRow>();
  for (const l of (leadsRes.data ?? []) as LeadRow[]) leadById.set(l.id, l);

  const items: CreationItem[] = [];
  for (const o of (outputsRes.data ?? []) as OutputRow[]) {
    const lead = leadById.get(o.lead_id);
    const slug = (lead?.dados as { siteSlug?: string } | null)?.siteSlug ?? null;
    const base = {
      id: o.id, title: lead?.nome ?? "", leadId: o.lead_id, leadName: lead?.nome ?? null,
      siteSlug: slug, status: "done" as const, erro: null, model: o.modelo, excerpt: null,
      createdAt: o.created_at,
    };
    if (o.tipo === "generate_site") items.push({ ...base, kind: "site", sub: "site" });
    else if (o.tipo === "generate_image") items.push({ ...base, kind: "image", sub: "image" });
    else if (TEXT_KINDS.has(o.tipo)) items.push({ ...base, kind: "text", sub: o.tipo });
  }
  for (const p of (projectsRes.data ?? []) as ProjectRow[]) {
    items.push({
      id: p.id, kind: "app", sub: p.target === "mobile" ? "app_mobile" : "app_web",
      title: p.nome ?? "", leadId: null, leadName: null, siteSlug: p.site_slug,
      status: p.status === "running" ? "running" : p.status === "error" ? "error" : "done",
      erro: p.erro, model: null, excerpt: null, createdAt: p.created_at,
    });
  }

  const filtered = items
    .filter((i) => type === "all" || i.kind === type)
    .filter((i) => !leadId || i.leadId === leadId)
    .filter((i) => !q || i.title.toLowerCase().includes(q) || (i.leadName ?? "").toLowerCase().includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pages);
  const pageItems = filtered.slice((safePage - 1) * size, safePage * size);

  const textIds = pageItems.filter((i) => i.kind === "text").map((i) => i.id);
  if (textIds.length > 0) {
    const { data: contents } = await session.supabase.from("lead_outputs")
      .select("id,conteudo").eq("user_id", session.user.id).in("id", textIds);
    const byId = new Map(((contents ?? []) as { id: string; conteudo: string }[]).map((c) => [c.id, c.conteudo]));
    for (const item of pageItems) {
      const full = byId.get(item.id);
      if (full) item.excerpt = full.length > 500 ? `${full.slice(0, 500)}…` : full;
    }
  }

  const leads = (leadsRes.data ?? []) as LeadRow[];
  return NextResponse.json(
    {
      items: pageItems, total, page: safePage, pages,
      leads: leads.map((l) => ({ id: l.id, nome: l.nome ?? "" })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
