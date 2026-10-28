import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AdminDomains } from "@/components/admin-domains";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Domínios", robots: { index: false } };

export default async function AdminDominiosPage() {
  await requireSession("/admin/dominios", { admin: true });
  const admin = createSupabaseAdminClient();

  const [domainsRes, priceRes, authUsers] = await Promise.all([
    admin.from("domains")
      .select("id,user_id,site_slug,desired_host,host,status,price_cents,payment_id,activated_at,expires_at,created_at,sites:site_slug(nome)")
      .order("created_at", { ascending: false }).limit(300),
    admin.from("app_settings").select("value").eq("key", "domain_price_cents").maybeSingle(),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailById = new Map((authUsers.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const paymentIds = (domainsRes.data ?? []).map((d) => d.payment_id).filter(Boolean) as string[];
  const { data: payments } = paymentIds.length > 0
    ? await admin.from("payments")
        .select("id,provider,method,amount_cents,status,created_at")
        .in("id", paymentIds)
    : { data: [] as { id: string; provider: string; method: string; amount_cents: number; status: string; created_at: string }[] };
  const paymentById = new Map((payments ?? []).map((p) => [p.id, p]));

  const rows = (domainsRes.data ?? []).map((d) => ({
    id: d.id,
    userEmail: emailById.get(d.user_id) ?? d.user_id.slice(0, 8),
    siteSlug: d.site_slug,
    siteNome: (d.sites as { nome?: string } | null)?.nome ?? d.site_slug,
    desiredHost: d.desired_host,
    host: d.host,
    status: d.status,
    priceCents: d.price_cents,
    expiresAt: d.expires_at,
    activatedAt: d.activated_at,
    createdAt: d.created_at,
    payment: d.payment_id ? paymentById.get(d.payment_id) ?? null : null,
  }));

  const priceCents = Math.min(1_000_000, Math.max(500, Number(priceRes.data?.value ?? 6999) || 6999));
  const pendentes = rows.filter((r) => r.status === "pending_setup").length;
  const ativos = rows.filter((r) => r.status === "active").length;

  return <>
    <span className="eyebrow">DOMÍNIOS CUSTOMIZADOS</span>
    <h1>Domínios próprios<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      {rows.length} pedidos · {ativos} ativos · {pendentes} aguardando configuração manual
      {pendentes > 0 && " — SLA de 48h"}.
    </p>
    <AdminDomains rows={rows} priceCents={priceCents} />
    <p className="private-disclaimer">
      <Globe size={13} /> Ative com o host definitivo — o usuário é notificado no app e o
      domínio passa a servir o site imediatamente.
    </p>
  </>;
}
