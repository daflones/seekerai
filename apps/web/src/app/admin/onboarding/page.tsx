import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { ClipboardList, MessageCircle, UserCheck, UserX, Users } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Onboarding", robots: { index: false, follow: false } };

// Mesmos values do WelcomeQuiz — o que vem no jsonb é a chave, aqui vira rótulo.
const ORIGENS: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube",
  google: "Pesquisa no Google", indicacao: "Indicação de amigos",
  whatsapp: "WhatsApp", facebook: "Facebook", outro: "Outro",
};
const DIFICULDADES: Record<string, string> = {
  encontrar_clientes: "Encontrar clientes",
  o_que_oferecer: "Saber o que oferecer",
  primeira_mensagem: "Primeira mensagem",
  converter: "Converter leads em vendas",
  portfolio: "Portfólio que passa confiança",
  organizar: "Organizar contatos",
  outra: "Outra coisa",
};

interface Row {
  id: string; nome: string; telefone: string | null;
  answers: { origem?: string; dificuldade?: string };
  vistoEm: string; cadastro: string;
}

const fmtData = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso));

function dist(rows: Row[], key: "origem" | "dificuldade") {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = r.answers[key];
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({
      label: (key === "origem" ? ORIGENS : DIFICULDADES)[k] ?? k,
      n, pct: total ? Math.round((n / total) * 100) : 0,
    }));
}

export default async function AdminOnboardingPage() {
  const { supabase } = await requireSession("/admin/onboarding", { admin: true });

  const [{ data: rows }, { count: totalUsers }] = await Promise.all([
    supabase.from("profiles")
      .select("id,nome,telefone,onboarding_answers,onboarding_visto_em,created_at")
      .not("onboarding_visto_em", "is", null)
      .order("onboarding_visto_em", { ascending: false })
      .limit(500),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const list: Row[] = (rows ?? []).map((p) => ({
    id: p.id as string,
    nome: (p.nome as string) || "—",
    telefone: p.telefone as string | null,
    answers: (p.onboarding_answers as Row["answers"]) ?? {},
    vistoEm: p.onboarding_visto_em as string,
    cadastro: p.created_at as string,
  }));

  const responderam = list.filter((r) => r.answers.origem || r.answers.dificuldade);
  const pularam = list.length - responderam.length;
  const pendentes = Math.max(0, (totalUsers ?? 0) - list.length);
  const taxa = list.length ? Math.round((responderam.length / list.length) * 100) : 0;
  const distOrigem = dist(responderam, "origem");
  const distDif = dist(responderam, "dificuldade");

  return <>
    <span className="eyebrow">AQUISIÇÃO</span>
    <h1>Quiz de boas-vindas<span className="gradient-text">.</span></h1>
    <p className="private-intro">
      Como os usuários chegaram no SeekerAi e qual a maior dor deles — preenchido na tela de boas-vindas.
    </p>

    <div className="stat-grid">
      <section className="stat-card"><span className="stat-icon"><UserCheck size={18} /></span>
        <strong>{responderam.length}</strong>
        <span className="stat-sub">responderam · taxa {taxa}%</span></section>
      <section className="stat-card"><span className="stat-icon"><UserX size={18} /></span>
        <strong>{pularam}</strong>
        <span className="stat-sub">pularam o quiz</span></section>
      <section className="stat-card"><span className="stat-icon"><Users size={18} /></span>
        <strong>{pendentes}</strong>
        <span className="stat-sub">não chegaram ainda (de {totalUsers ?? 0} contas)</span></section>
      <section className="stat-card"><span className="stat-icon"><ClipboardList size={18} /></span>
        <strong>{distOrigem[0]?.label ?? "—"}</strong>
        <span className="stat-sub">principal origem · {distDif[0]?.label ?? "—"}</span></section>
    </div>

    <div className="adm-onb-charts">
      <section className="dash-panel">
        <div className="dash-panel-heading"><h2>Como conheceu o SeekerAi <span className="adm-count">{responderam.filter((r) => r.answers.origem).length}</span></h2></div>
        <ul className="adm-dist">
          {distOrigem.map((d) => (
            <li key={d.label} className="adm-dist-row">
              <span className="adm-dist-label">{d.label}</span>
              <span className="adm-dist-track"><span className="adm-dist-fill" style={{ width: `${d.pct}%` }} /></span>
              <strong className="adm-mono">{d.n} <small>({d.pct}%)</small></strong>
            </li>
          ))}
          {!distOrigem.length && <p className="dash-empty">Nenhuma resposta ainda.</p>}
        </ul>
      </section>
      <section className="dash-panel">
        <div className="dash-panel-heading"><h2>Maior dificuldade pra vender <span className="adm-count">{responderam.filter((r) => r.answers.dificuldade).length}</span></h2></div>
        <ul className="adm-dist">
          {distDif.map((d) => (
            <li key={d.label} className="adm-dist-row">
              <span className="adm-dist-label">{d.label}</span>
              <span className="adm-dist-track"><span className="adm-dist-fill" style={{ width: `${d.pct}%` }} /></span>
              <strong className="adm-mono">{d.n} <small>({d.pct}%)</small></strong>
            </li>
          ))}
          {!distDif.length && <p className="dash-empty">Nenhuma resposta ainda.</p>}
        </ul>
      </section>
    </div>

    <section className="dash-panel">
      <div className="dash-panel-heading"><h2>Respostas por usuário <span className="adm-count">{list.length}</span></h2></div>
      <div className="adm-onb-table">
        <div className="adm-onb-row adm-onb-head">
          <span>Usuário</span><span>Como conheceu</span><span>Maior dificuldade</span><span>Quando</span>
        </div>
        {list.map((r) => {
          const pulou = !r.answers.origem && !r.answers.dificuldade;
          const wa = r.telefone ? `https://wa.me/${r.telefone.replace(/\D/g, "")}` : null;
          return (
            <div key={r.id} className="adm-onb-row">
              <span className="adm-onb-user">
                <strong>{r.nome}</strong>
                {wa
                  ? <a href={wa} target="_blank" rel="noreferrer" title={r.telefone ?? ""}><MessageCircle size={12} /> {r.telefone}</a>
                  : <small>cadastro {fmtData(r.cadastro)}</small>}
              </span>
              <span>{pulou ? <em className="adm-onb-skip">Pulou</em> : r.answers.origem ? <span className="lead-status lead-status-novo">{ORIGENS[r.answers.origem] ?? r.answers.origem}</span> : "—"}</span>
              <span>{pulou ? "" : r.answers.dificuldade ? <span className="lead-status lead-status-respondeu">{DIFICULDADES[r.answers.dificuldade] ?? r.answers.dificuldade}</span> : "—"}</span>
              <span className="adm-onb-date">{fmtData(r.vistoEm)}</span>
            </div>
          );
        })}
        {!list.length && <p className="dash-empty">Ninguém passou pelo quiz ainda.</p>}
      </div>
    </section>
  </>;
}
