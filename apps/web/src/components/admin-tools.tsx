"use client";

import { useState } from "react";
import { FlaskConical, Loader2, Play } from "lucide-react";

const TOOLS: [string, string][] = [
  ["ping-db", "Ping DB"],
  ["jobs-scan", "Jobs scan"],
  ["ticket-scan", "Chamados scan"],
  ["ledger-scan", "Ledger scan"],
  ["queue-health", "Saúde da fila"],
  ["sweep-support", "Sweep suporte"],
  ["expire-sites", "Expirar sites"],
  ["agent-ping", "Ping agente"],
  ["agent-live", "Agente vivo"],
];

// Console de testes do painel admin: dispara as ferramentas allowlist de
// /api/admin/tools e mostra a resposta JSON + latência.
export function AdminTools() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ tool: string; ms: number; body: string } | null>(null);
  const [error, setError] = useState("");

  async function run(tool: string) {
    if (busy) return;
    setBusy(tool);
    setError("");
    const res = await fetch("/api/admin/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusy(null);
    if (!res?.ok || !data) {
      setError(data?.error ?? "Falha ao executar a ferramenta.");
      return;
    }
    setResult({ tool, ms: data.ms ?? 0, body: JSON.stringify(data.result, null, 2) });
  }

  return (
    <div className="adm-tools">
      <div className="adm-tools-bar">
        {TOOLS.map(([key, label]) => (
          <button key={key} type="button" className="adm-tool-btn"
            disabled={busy !== null} onClick={() => void run(key)}>
            {busy === key ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
            {label}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      {result && (
        <div className="adm-tool-out">
          <div className="adm-tool-out-head">
            <FlaskConical size={13} />
            <strong>{result.tool}</strong>
            <span className="adm-tool-ms">{result.ms} ms</span>
          </div>
          <pre>{result.body}</pre>
        </div>
      )}
      {!result && !error && (
        <p className="adm-tools-hint">
          Sondagens de leitura, sweeps de manutenção e teste vivo do agente de suporte.
          O teste vivo cria e apaga um chamado real do próprio admin.
        </p>
      )}
    </div>
  );
}
