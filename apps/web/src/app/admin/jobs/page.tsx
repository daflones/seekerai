import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { AdminJobs } from "@/components/admin-jobs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jobs", robots: { index: false, follow: false } };

export default async function AdminJobsPage() {
  await requireSession("/admin/jobs", { admin: true });
  return <>
    <span className="eyebrow">FILA VIVA</span>
    <h1>Jobs em tempo real<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Buscas no radar, gerações de site e apps do Estúdio — quem pediu, o que está
      rolando e o progresso de cada etapa. Atualiza sozinho a cada 4 segundos.
    </p>
    <section className="dash-panel">
      <AdminJobs initial={[]} />
    </section>
  </>;
}
