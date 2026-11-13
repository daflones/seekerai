"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Radar, Save } from "lucide-react";
import type { LeadSearchConfig } from "@/lib/lead-search-config";

const PLANOS = [
  { key: "default", label: "Padrão (trial/grátis)" },
  { key: "essencial", label: "Essencial" },
  { key: "pro", label: "Pro" },
  { key: "king", label: "King" },
] as const;

export function AdminSearch({ initial }: { initial: LeadSearchConfig }) {
  const [cfg, setCfg] = useState<LeadSearchConfig>(initial);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const dirty = JSON.stringify({ ...cfg, motivo: "" }) !== JSON.stringify({ ...initial, motivo: "" });

  const setTarget = (key: string, v: number) =>
    setCfg((c) => ({ ...c, targets: { ...c.targets, [key]: Math.min(200, Math.max(5, Math.trunc(v) || 5)) } }));

  async function save() {
    setBusy(true);
    setError("");
    setSaved("");
    const res = await fetch("/api/admin/search-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cfg, motivo }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Não foi possível salvar."); return; }
    setSaved(data.message ?? "Salvo.");
    setMotivo("");
  }

  return (
    <section className="cred-section">
      <header className="cred-head">
        <h3><Radar size={15} /> Busca inteligente de leads</h3>
        <p>
          Quantos leads o radar tenta entregar por plano, o tamanho do pool varrido
          e as rodadas de expansão pra região vizinha quando faltam leads com
          Instagram e sem site.
        </p>
      </header>

      <div className="cred-rows">
        {PLANOS.map((p) => (
          <div className="cred-row" key={p.key}>
            <span className="cred-name"><strong>{p.label}</strong></span>
            <label className="pack-field">
              <small>Leads por busca</small>
              <input className="cred-num" type="number" min={5} max={200}
                value={cfg.targets[p.key as keyof typeof cfg.targets] ?? 20}
                onChange={(e) => setTarget(p.key, Number(e.target.value))} />
            </label>
          </div>
        ))}
      </div>

      <div className="cred-rows" style={{ marginTop: 14 }}>
        <div className="cred-row">
          <span className="cred-name"><strong>Pool varrido</strong><small>multiplicador sobre o target — a filtragem descarta parte</small></span>
          <label className="pack-field">
            <small>× alvo (1–4)</small>
            <input className="cred-num" type="number" min={1} max={4} step={0.5}
              value={cfg.pool_multiplier}
              onChange={(e) => setCfg((c) => ({ ...c, pool_multiplier: Math.min(4, Math.max(1, Number(e.target.value) || 1)) }))} />
          </label>
        </div>
        <div className="cred-row">
          <span className="cred-name"><strong>Expansão regional</strong><small>rodadas extras em localidade próxima quando faltam leads qualificados</small></span>
          <label className="pack-field">
            <small>Rodadas (0–4)</small>
            <input className="cred-num" type="number" min={0} max={4}
              value={cfg.expand_rounds}
              onChange={(e) => setCfg((c) => ({ ...c, expand_rounds: Math.min(4, Math.max(0, Math.trunc(Number(e.target.value) || 0))) }))} />
          </label>
          <label className="pack-field">
            <small>Raio (km)</small>
            <input className="cred-num" type="number" min={5} max={100}
              value={cfg.expand_radius_km}
              onChange={(e) => setCfg((c) => ({ ...c, expand_radius_km: Math.min(100, Math.max(5, Number(e.target.value) || 25)) }))} />
          </label>
        </div>
      </div>

      <div className="cred-rows" style={{ marginTop: 14 }}>
        <label className="cred-check">
          <input type="checkbox" checked={cfg.smart_filter}
            onChange={(e) => setCfg((c) => ({ ...c, smart_filter: e.target.checked }))} />
          <span><strong>Filtro inteligente</strong><small>Prioriza Instagram sem site; sem ele, volta a ordenação por score.</small></span>
        </label>
        <label className="cred-check">
          <input type="checkbox" checked={cfg.fallback_site_ok}
            onChange={(e) => setCfg((c) => ({ ...c, fallback_site_ok: e.target.checked }))} />
          <span><strong>Fallback com site fraco</strong><small>Se não achar leads sem site suficientes, inclui quem tem Insta + site desatualizado/fora do ar.</small></span>
        </label>
      </div>

      <label className="pack-field" style={{ marginTop: 14, maxWidth: 420 }}>
        <small>Motivo da alteração (auditado)</small>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300}
          placeholder="Ex.: aumentar pool do King pra compensar filtro" />
      </label>

      {error && <p role="alert" className="auth-error" style={{ marginTop: 10 }}>{error}</p>}
      {saved && <p role="status" className="editor-saved" style={{ marginTop: 10 }}><CheckCircle2 size={15} />{saved}</p>}
      {dirty && (
        <button type="button" className="cred-save" style={{ marginTop: 10 }} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
          {busy ? "Salvando…" : "Salvar configuração da busca"}
        </button>
      )}
    </section>
  );
}
