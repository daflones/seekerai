"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ChevronDown, Compass, ExternalLink, LayoutGrid,
  Loader2, MonitorSmartphone, RefreshCw, Sparkles,
} from "lucide-react";

export interface AdminJob {
  id: string;
  fonte: "busca" | "ia" | "estudio";
  tipo: string;
  titulo: string;
  detalhe: string;
  usuario: string;
  status: string;
  progresso: number;
  etapa: string | null;
  erro: string | null;
  created_at: string;
  updated_at: string;
  resumo: string | null;
  itens: string[];
  link: string | null;
}

const FONTE_ICON = { busca: Compass, ia: Sparkles, estudio: MonitorSmartphone } as const;
const FILTROS: [string, string][] = [
  ["rodando", "Rodando"],
  ["hoje", "Hoje"],
  ["erros", "Erros"],
  ["todos", "Todos"],
];

function elapsed(from: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

// Monitor vivo dos jobs: polling a cada 4s, barra de progresso por etapa,
// dono do job e resultado expandível.
export function AdminJobs({ initial }: { initial: AdminJob[] }) {
  const [jobs, setJobs] = useState(initial);
  const [filtro, setFiltro] = useState("rodando");
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [, tick] = useState(0);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const res = await fetch("/api/admin/jobs", { cache: "no-store" }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    if (data?.jobs) { setJobs(data.jobs as AdminJob[]); setLastFetch(new Date()); }
    busyRef.current = false;
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 4000);
    const clock = setInterval(() => tick((t) => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);

  const runningCount = jobs.filter((j) => j.status === "running").length;
  const hoje = new Date().toDateString();
  const list = jobs.filter((j) => {
    if (filtro === "rodando") return j.status === "running";
    if (filtro === "erros") return j.status === "error";
    if (filtro === "hoje") return new Date(j.created_at).toDateString() === hoje;
    return true;
  });

  return <>
    <div className="adm-jobs-bar">
      <div className="chamados-filters" style={{ marginBottom: 0 }}>
        {FILTROS.map(([key, label]) => (
          <button key={key} type="button" className={filtro === key ? "active" : ""}
            onClick={() => setFiltro(key)}>
            {label}{key === "rodando" && runningCount > 0 ? ` (${runningCount})` : ""}
          </button>
        ))}
      </div>
      <span className="adm-jobs-live">
        {runningCount > 0 ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
        {lastFetch ? `atualizado ${lastFetch.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "ao vivo"}
      </span>
    </div>

    <ul className="adm-jobs">
      {list.length === 0 && <li className="dash-empty">Nenhum job nesse filtro.</li>}
      {list.map((j) => {
        const Icon = FONTE_ICON[j.fonte] ?? LayoutGrid;
        const running = j.status === "running";
        const pct = j.status === "done" ? 100 : j.progresso;
        return (
          <li key={j.id} className={`adm-job adm-job-${j.status}`}>
            <button type="button" className="adm-job-head" onClick={() => setOpenId(openId === j.id ? null : j.id)}>
              <span className={`adm-job-ico adm-job-ico-${j.fonte}`}>
                {running ? <Loader2 size={15} className="spin" /> : <Icon size={15} />}
              </span>
              <span className="adm-job-main">
                <strong>{j.titulo}</strong>
                <small>{j.tipo} · {j.usuario} · {j.detalhe}</small>
              </span>
              <span className="adm-job-side">
                <span className={`ticket-status ticket-${j.status === "done" ? "resolvido" : j.status === "error" ? "cancelado" : "em_andamento"}`}>
                  {j.status === "done" ? "Concluído" : j.status === "error" ? "Erro" : running ? `${pct}%` : j.status}
                </span>
                <small>{elapsed(j.created_at)}</small>
                <ChevronDown size={14} className={openId === j.id ? "adm-job-open" : ""} />
              </span>
            </button>
            <div className="adm-job-track">
              <div className={`adm-job-fill ${j.status === "error" ? "adm-job-fill-err" : ""}`}
                style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            {(j.etapa || j.erro) && (
              <div className="adm-job-etapa">
                {j.erro ? <><AlertTriangle size={12} /> {j.erro}</> : j.etapa}
              </div>
            )}
            {openId === j.id && (
              <div className="adm-job-detail">
                {j.resumo && <p className="adm-job-resumo">{j.resumo}</p>}
                {j.itens.length > 0 && (
                  <ul className="adm-job-itens">
                    {j.itens.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                )}
                {j.link && (
                  <a href={j.link} target="_blank" rel="noreferrer" className="text-link">
                    Abrir resultado <ExternalLink size={12} />
                  </a>
                )}
                {!j.resumo && !j.link && j.itens.length === 0 && (
                  <p className="adm-job-resumo">Sem resumo disponível{running ? " ainda" : ""}.</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  </>;
}
