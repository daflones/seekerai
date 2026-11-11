import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { AdminCreations } from "@/components/admin-creations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criações", robots: { index: false, follow: false } };

export default async function AdminCreationsPage() {
  await requireSession("/admin/criacoes", { admin: true });
  return <>
    <span className="eyebrow">TUDO QUE A IA PRODUZ</span>
    <h1>Criações dos usuários<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Sites de lead, apps web e mobile do Estúdio, imagens e textos — de quem foi,
      com qual modelo, o prompt usado e o código gerado. Abra, navegue e edite.
    </p>
    <section className="dash-panel">
      <AdminCreations />
    </section>
  </>;
}
