import type { Metadata } from "next";
import { Clock3, Mail } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { SupportForm } from "@/components/support-form";
import { SupportCenter } from "@/components/support-center";
import { getLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Suporte", robots: { index: false } };

export default async function SuportePage() {
  const [{ supabase, user }, loc] = await Promise.all([requireSession("/app/suporte"), getLocale()]);
  const m = getMessages(loc.lang);
  const t = m.misc;
  const { data: tickets } = await supabase
    .from("support_tickets").select("id,assunto,categoria,prioridade,status,created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);

  return <>
    <span className="eyebrow">{t.supportEyebrow}</span>
    <h1>{t.supportTitle}<span className="gradient-text">.</span></h1>
    <p className="private-intro">{t.supportIntro}</p>

    <div className="support-grid">
      <section className="dash-panel">
        <h2>{t.supportFormT}</h2>
        <p className="dash-hint">{t.supportFormP}</p>
        <SupportForm t={m.support} />
      </section>
      <aside className="dash-panel support-side">
        <h2><Mail size={16} /> {t.supportMailT}</h2>
        <p className="dash-hint">{t.supportMailP}</p>
        <code className="support-mail">suporte@seekerai.digital</code>
        <p className="dash-hint"><Clock3 size={13} /> {t.supportSla}</p>
      </aside>
    </div>

    <section className="dash-panel">
      <h2>{t.supportListT}</h2>
      <p className="dash-hint">{t.supportListP}</p>
      <SupportCenter tickets={tickets ?? []} t={m.support} lang={loc.lang} />
    </section>
  </>;
}
