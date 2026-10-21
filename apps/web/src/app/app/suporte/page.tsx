import type { Metadata } from "next";
import { Clock3, Mail } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { SupportForm } from "@/components/support-form";
import { SupportCenter } from "@/components/support-center";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Suporte", robots: { index: false } };

export default async function SuportePage() {
  const { supabase, user } = await requireSession("/app/suporte");
  const { data: tickets } = await supabase
    .from("support_tickets").select("id,assunto,categoria,prioridade,status,created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);

  return <>
    <span className="eyebrow">ESTAMOS POR AQUI</span>
    <h1>Como podemos ajudar?<span className="gradient-text">.</span></h1>
    <p className="private-intro">Abra um chamado e converse com o suporte em tempo real, ou fale por e-mail.</p>

    <div className="support-grid">
      <section className="dash-panel">
        <h2>Enviar um chamado</h2>
        <p className="dash-hint">Descreva sua dúvida ou problema — a conversa continua aqui mesmo, como um chat.</p>
        <SupportForm />
      </section>
      <aside className="dash-panel support-side">
        <h2><Mail size={16} /> Falar por e-mail</h2>
        <p className="dash-hint">Prefere mandar direto? Escreva para:</p>
        <code className="support-mail">suporte@seekerai.digital</code>
        <p className="dash-hint"><Clock3 size={13} /> Respondemos normalmente em até 1 dia útil.</p>
      </aside>
    </div>

    <section className="dash-panel">
      <h2>Seus chamados</h2>
      <p className="dash-hint">Clique em um chamado para abrir a conversa e acompanhar as respostas.</p>
      <SupportCenter tickets={tickets ?? []} />
    </section>
  </>;
}
