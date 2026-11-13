"use client";

import { useEffect, useRef } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { getMessages } from "@/lib/i18n/messages";
import type { Lang } from "@/lib/i18n/shared";

export interface GenEvent {
  p?: number | null;
  etapa?: string | null;
  at?: string | null;
}

function fmtTime(at: string | null | undefined, lang: Lang): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
}

// Janela de "chat" mostrando o que a IA está fazendo durante a geração:
// cada etapa reportada pela edge vira uma bolha, com spinner na última.
export function GenActivity({ events, running, lang = "pt", max = 30 }: {
  events: GenEvent[];
  running: boolean;
  lang?: Lang;
  max?: number;
}) {
  const list = events.slice(-max);
  const bottom = useRef<HTMLDivElement>(null);
  const c = getMessages(lang).common;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [list.length, running]);

  return <div className="gen-act" role="log" aria-live="polite" aria-label={c.aiWorking}>
    <div className="gen-act-head">
      {running ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
      <b>{running ? c.aiWorking : c.aiDone}</b>
    </div>
    <div className="gen-act-list">
      {list.length === 0 && running &&
        <div className="gen-act-msg is-live">
          <span className="gen-act-ico"><Loader2 size={12} className="spin" /></span>
          <p>{c.aiThinking}</p>
        </div>}
      {list.map((e, i) => {
        const live = running && i === list.length - 1;
        return <div key={`${e.at ?? ""}-${i}`} className={`gen-act-msg${live ? " is-live" : ""}`}>
          <span className="gen-act-ico">
            {live ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
          </span>
          <p>{e.etapa}</p>
          <time>{fmtTime(e.at, lang)}</time>
        </div>;
      })}
      <div ref={bottom} />
    </div>
  </div>;
}
