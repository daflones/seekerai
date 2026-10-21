"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Briefcase, CircleEllipsis, Facebook, Instagram, Lightbulb, ListChecks, MessageCircle, MessagesSquare, Search, Share2, TrendingUp, Youtube } from "lucide-react";
import { Brand } from "./brand";

const ORIGENS = [
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "tiktok", label: "TikTok", icon: Share2 },
  { value: "youtube", label: "YouTube", icon: Youtube },
  { value: "google", label: "Pesquisa no Google", icon: Search },
  { value: "indicacao", label: "Indicação de amigos", icon: MessagesSquare },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "facebook", label: "Facebook", icon: Facebook },
  { value: "outro", label: "Outro", icon: CircleEllipsis },
];

const DIFICULDADES = [
  { value: "encontrar_clientes", label: "Encontrar clientes", icon: Search },
  { value: "o_que_oferecer", label: "Saber o que oferecer para cada empresa", icon: Lightbulb },
  { value: "primeira_mensagem", label: "Saber o que falar na primeira mensagem", icon: MessageCircle },
  { value: "converter", label: "Converter leads em vendas", icon: TrendingUp },
  { value: "portfolio", label: "Ter um portfólio que passe confiança", icon: Briefcase },
  { value: "organizar", label: "Organizar meus contatos e oportunidades", icon: ListChecks },
  { value: "outra", label: "Outra coisa", icon: CircleEllipsis },
];

export function WelcomeQuiz({ name }: { name: string }) {
  const router = useRouter();
  const [origem, setOrigem] = useState("");
  const [dificuldade, setDificuldade] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish(answers: { origem?: string; dificuldade?: string }) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      if (!res.ok) {
        setError("Não foi possível salvar agora. Tente novamente.");
        setBusy(false);
        return;
      }
      router.replace("/app");
    } catch {
      setError("Sem conexão. Tente novamente.");
      setBusy(false);
    }
  }

  return <div className="welcome-screen">
    <div className="welcome-card">
      <span className="welcome-logo"><Brand /></span>
      <h1>Bem-vindo ao SeekerAi{name ? `, ${name.split(" ")[0]}` : ""}</h1>
      <p>Duas perguntas rápidas pra deixar o SeekerAi com a sua cara — responda se quiser.</p>

      <div className="welcome-question">
        <strong>Como você conheceu o SeekerAi? <em>(opcional)</em></strong>
        <div className="welcome-grid welcome-grid-4">
          {ORIGENS.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" className={origem === value ? "selected" : ""} onClick={() => setOrigem(value)}>
              <Icon size={20} /><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="welcome-question">
        <strong>Qual sua maior dificuldade hoje para vender seus serviços? <em>(opcional)</em></strong>
        <div className="welcome-grid welcome-grid-2">
          {DIFICULDADES.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" className={dificuldade === value ? "selected" : ""} onClick={() => setDificuldade(value)}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="auth-error">{error}</p>}

      <button className="button button-primary welcome-cta" disabled={busy} onClick={() => void finish({ origem, dificuldade })}>
        {busy ? "Abrindo seu radar…" : <>Começar a usar o SeekerAi <ArrowRight size={16} /></>}
      </button>
      <button className="text-link welcome-skip" disabled={busy} onClick={() => void finish({})}>Pular</button>
    </div>
  </div>;
}
