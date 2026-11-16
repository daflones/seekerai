"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Gauge, RefreshCw } from "lucide-react";

type ProviderCredit = {
  provider: string;
  label: string;
  status: "ok" | "warn" | "danger" | "off" | "error";
  value: string;
  detail?: string;
};

const STATUS_CLASS: Record<ProviderCredit["status"], string> = {
  ok: "adm-pill-ok",
  warn: "adm-pill-warn",
  danger: "adm-pill-danger",
  off: "adm-pill",
  error: "adm-pill-danger",
};

const POLL_MS = 30_000;

export function AdminProviderCredits() {
  const [credits, setCredits] = useState<ProviderCredit[] | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setBusy(true);
    try {
      const res = await fetch("/api/admin/provider-credits", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.credits) {
        setCredits(body.credits);
        setAt(body.at ?? new Date().toISOString());
      }
    } catch {
      // silencioso — o próximo poll tenta de novo
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    timer.current = setInterval(() => void load(), POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  return (
    <section className="dash-panel">
      <h2><Gauge size={16} /> Créditos dos provedores</h2>
      <p className="dash-hint">
        Saldo real consultado nas APIs — Serper (mapas/busca), ScrapeCreators (Instagram)
        e OpenRouter (IA). Atualiza sozinho a cada 30s.
      </p>
      {credits === null ? (
        <p className="dash-empty">Consultando provedores…</p>
      ) : (
        <ul className="adm-feed">
          {credits.map((c, i) => (
            <li key={i} className="adm-feed-row">
              <span className={`adm-pill ${STATUS_CLASS[c.status]}`} style={{ minWidth: 0 }}>
                {c.value}
              </span>
              <span>
                <strong>{c.label}</strong>
                {c.detail ? <small> · {c.detail}</small> : null}
                {c.status === "danger" ? <small> · sem crédito</small> : null}
                {c.status === "error" ? <small> · API indisponível</small> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="dash-links">
        <button type="button" className="text-link" onClick={() => void load(true)} disabled={busy}
          style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", color: "inherit", display: "inline-flex", alignItems: "center", gap: 4, padding: 0 }}>
          <RefreshCw size={13} className={busy ? "spin" : ""} />
          {at ? `Atualizado ${new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Atualizar"}
        </button>
      </div>
    </section>
  );
}
