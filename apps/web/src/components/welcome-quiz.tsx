"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Briefcase, CircleEllipsis, Facebook, Instagram, Lightbulb, ListChecks, MessageCircle, MessagesSquare, Search, Share2, TrendingUp, Youtube } from "lucide-react";
import { Brand } from "./brand";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { trackMeta } from "@/lib/meta";

export function WelcomeQuiz({ name, t }: { name: string; t?: Messages["welcome"] }) {
  const tt = t ?? getMessages("pt").welcome;
  const ORIGENS = [
    { value: "instagram", label: "Instagram", icon: Instagram },
    { value: "tiktok", label: "TikTok", icon: Share2 },
    { value: "youtube", label: "YouTube", icon: Youtube },
    { value: "google", label: tt.o1, icon: Search },
    { value: "indicacao", label: tt.o2, icon: MessagesSquare },
    { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { value: "facebook", label: "Facebook", icon: Facebook },
    { value: "outro", label: tt.o3, icon: CircleEllipsis },
  ];
  const DIFICULDADES = [
    { value: "encontrar_clientes", label: tt.d1, icon: Search },
    { value: "o_que_oferecer", label: tt.d2, icon: Lightbulb },
    { value: "primeira_mensagem", label: tt.d3, icon: MessageCircle },
    { value: "converter", label: tt.d4, icon: TrendingUp },
    { value: "portfolio", label: tt.d5, icon: Briefcase },
    { value: "organizar", label: tt.d6, icon: ListChecks },
    { value: "outra", label: tt.d7, icon: CircleEllipsis },
  ];
  const router = useRouter();
  // Cadastro concluído — evento de conversão da campanha.
  useEffect(() => { trackMeta("CompleteRegistration"); }, []);
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
        setError(tt.errSave);
        setBusy(false);
        return;
      }
      router.replace("/app");
    } catch {
      setError(tt.errNet);
      setBusy(false);
    }
  }

  return <div className="welcome-screen">
    <div className="welcome-card">
      <span className="welcome-logo"><Brand /></span>
      <h1>{tt.hi}{name ? `, ${name.split(" ")[0]}` : ""}</h1>
      <p>{tt.sub}</p>

      <div className="welcome-question">
        <strong>{tt.q1} <em>{tt.optional}</em></strong>
        <div className="welcome-grid welcome-grid-4">
          {ORIGENS.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" className={origem === value ? "selected" : ""} onClick={() => setOrigem(value)}>
              <Icon size={20} /><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="welcome-question">
        <strong>{tt.q2} <em>{tt.optional}</em></strong>
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
        {busy ? tt.going : <>{tt.go} <ArrowRight size={16} /></>}
      </button>
      <button className="text-link welcome-skip" disabled={busy} onClick={() => void finish({})}>{tt.skip}</button>
    </div>
  </div>;
}
