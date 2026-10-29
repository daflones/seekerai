import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { planAllowsPaidFeatures } from "@/lib/plans/capabilities";

// Token interno derivado do secret do servidor — sem env nova.
// A página /site/[slug] libera o fetch feito pelo editor via esse header,
// então o dono consegue editar mesmo com o site no gate de expiração.
export const EDITOR_HEADER = "x-seeker-editor";
export function editorToken(): string {
  return createHash("sha256")
    .update(process.env.SUPABASE_SECRET_KEY ?? "")
    .digest("hex")
    .slice(0, 32);
}

// Editor visual: planos Pro/King, admin ou a conta de teste. Os demais
// veem o botão bloqueado e a API nega com 403.
const SITE_EDITOR_BETA_EMAIL = "chokitowww@gmail.com";
export function siteEditorAllowed(
  email: string | null | undefined,
  isAdmin: boolean,
  planSlug: string | null | undefined,
): boolean {
  return isAdmin
    || (email ?? "").toLowerCase() === SITE_EDITOR_BETA_EMAIL
    || planAllowsPaidFeatures(planSlug);
}

export interface EditableSite {
  slug: string;
  nome: string;
  tipo: string;
  lead_id: string | null;
  config: Record<string, unknown>;
  legacyOutput?: { leadId: string; html: string } | null;
}

// Site editável pelo usuário: dono do lead, owner do config ou admin.
// Sites legados (só em lead_outputs, sem linha em `sites`) também entram.
export async function loadEditableSite(
  slug: string, userId: string, isAdmin: boolean,
): Promise<EditableSite | null> {
  const admin = createSupabaseAdminClient();
  const { data: site } = await admin.from("sites")
    .select("slug,tipo,nome,lead_id,config").eq("slug", slug).maybeSingle();
  if (site) {
    const config = (site.config ?? {}) as Record<string, unknown>;
    if (isAdmin || config.owner === userId) {
      return { slug: site.slug, nome: site.nome, tipo: site.tipo, lead_id: site.lead_id, config };
    }
    if (site.lead_id) {
      const { data: lead } = await admin.from("leads")
        .select("user_id").eq("id", site.lead_id).maybeSingle();
      if (lead?.user_id === userId) {
        return { slug: site.slug, nome: site.nome, tipo: site.tipo, lead_id: site.lead_id, config };
      }
    }
    return null;
  }

  // Legado: o /site renderiza lead_outputs.generate_site via dados->>siteSlug.
  const { data: lead } = await admin.from("leads")
    .select("id,user_id,nome").eq("dados->>siteSlug", slug).maybeSingle();
  if (!lead || (lead.user_id !== userId && !isAdmin)) return null;
  const { data: output } = await admin.from("lead_outputs")
    .select("conteudo").eq("lead_id", lead.id).eq("tipo", "generate_site")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!output?.conteudo) return null;
  return {
    slug, nome: lead.nome, tipo: "custom", lead_id: lead.id,
    config: {}, legacyOutput: { leadId: lead.id, html: output.conteudo },
  };
}
