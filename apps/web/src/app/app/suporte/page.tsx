import type { Metadata } from "next";
import { Clock3, Mail } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { SupportForm } from "@/components/support-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Suporte", robots: { index: false } };

const STATUS: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
};

export default async function SuportePage() {
  const { supabase, user } = await requireSession("/app/suporte");
  const { data: tickets } = await supabase
    .from("support_tickets").select("id,assunto,categoria,prioridade,status,resposta,created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);

  return <>
    <span className="eyebrow">ESTAMOS POR AQUI</span>
    <h1>Como podemos ajudar?<span className="gradient-text">.</span></h1>
    <p className="private-intro">Abra um chamado ou fale com o suporte do SeekerAi por e-mail.</p>

    <div className="support-grid">
      <section className="dash-panel">
        <h2>Enviar um chamado</h2>
        <p className="dash-hint">Descreva sua dúvida ou problema — a equipe analisa e responde por e-mail.</p>
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
      {(tickets ?? []).length === 0
        ? <p className="dash-empty">Nenhum chamado ainda. Quando você abrir um, ele aparece aqui.</p>
        : <ul className="ticket-list">
            {(tickets ?? []).map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.assunto}</strong>
                  <small>{new Date(t.created_at).toLocaleDateString("pt-BR")} · prioridade {t.prioridade}</small>
                </div>
                <span className={`ticket-status ticket-${t.status}`}>{STATUS[t.status] ?? t.status}</span>
                {t.resposta && <p className="ticket-reply">{t.resposta}</p>}
              </li>
            ))}
          </ul>}
    </section>
  </>;
}
