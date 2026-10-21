"use client";

import { useState } from "react";
import { CheckCircle2, Clapperboard, KeyRound, Save, Search, Trash2 } from "lucide-react";

interface SecretRow {
  provedor: string;
  nome: string;
  ultimos4: string;
  updated_at: string;
}

interface SearchRun {
  id: string;
  query: string;
  provider: string;
  resultados: number;
  created_at: string;
}

const KNOWN_KEYS: { nome: string; descricao: string }[] = [
  { nome: "APIFY_API_TOKEN", descricao: "Token Apify — actor de busca no Google Maps" },
  { nome: "GOOGLE_PLACES_API_KEY", descricao: "Places API (New) — provedor oficial de busca" },
  { nome: "OPENROUTER_API_KEY", descricao: "OpenRouter — IA de estratégia, mensagens, sites e imagens" },
  { nome: "STRIPE_SECRET_KEY", descricao: "Stripe — checkout de assinatura em cartão" },
  { nome: "STRIPE_WEBHOOK_SECRET", descricao: "Stripe — assinatura do webhook (whsec_...)" },
  { nome: "MERCOSULPAY_API_KEY", descricao: "MercosulPay — criação de cobranças PIX" },
  { nome: "MERCOSULPAY_WEBHOOK_SECRET", descricao: "MercosulPay — assinatura do webhook" },
  { nome: "EVOLUTION_API_URL", descricao: "Evolution — URL base da instância WhatsApp" },
  { nome: "EVOLUTION_INSTANCE", descricao: "Evolution — nome da instância" },
  { nome: "EVOLUTION_API_KEY", descricao: "Evolution — apikey da instância" },
  { nome: "AI_TEXT_MODEL", descricao: "Modelo de texto (padrão: openai/gpt-4o-mini)" },
  { nome: "AI_IMAGE_MODEL", descricao: "Modelo de imagem (padrão: google/gemini-2.5-flash-image)" },
  { nome: "AI_SITE_MODEL", descricao: "Modelo de sites (padrão: anthropic/claude-sonnet-4)" },
];

export function IntegrationsEditor({
  initialSecrets,
  initialProvider,
  initialReplay,
  initialRuns,
}: {
  initialSecrets: SecretRow[];
  initialProvider: "google_places" | "apify";
  initialReplay: boolean;
  initialRuns: SearchRun[];
}) {
  const [secrets, setSecrets] = useState<SecretRow[]>(initialSecrets);
  const [provider, setProvider] = useState(initialProvider);
  const [replay, setReplay] = useState(initialReplay);
  const [runs, setRuns] = useState<SearchRun[]>(initialRuns);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const configured = new Map(initialSecrets.map((s) => [s.nome, s]));

  async function send(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    setSaved("");
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, motivo: reason.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error || "Não foi possível salvar."); return false; }
    setSaved(data.message || "Salvo.");
    return true;
  }

  async function saveSecret(nome: string) {
    const valor = values[nome]?.trim();
    if (!valor) { setError(`Informe o valor de ${nome}.`); return; }
    if (await send({ acao: "definir-secret", nome, valor }, nome)) {
      setSecrets((current) => [
        ...current.filter((s) => s.nome !== nome),
        { provedor: "edge", nome, ultimos4: valor.slice(-4), updated_at: new Date().toISOString() },
      ]);
      setValues((current) => ({ ...current, [nome]: "" }));
      configured.set(nome, { provedor: "edge", nome, ultimos4: valor.slice(-4), updated_at: new Date().toISOString() });
    }
  }

  async function removeSecret(nome: string) {
    if (await send({ acao: "remover-secret", nome }, `del-${nome}`)) {
      setSecrets((current) => current.filter((s) => s.nome !== nome));
      configured.delete(nome);
    }
  }

  async function saveProvider(next: "google_places" | "apify") {
    if (await send({ acao: "definir-setting", chave: "search_provider", valor: next }, "provider")) {
      setProvider(next);
    }
  }

  async function saveReplay(next: boolean) {
    if (await send({ acao: "definir-setting", chave: "search_replay", valor: next ? "on" : "off" }, "replay")) {
      setReplay(next);
    }
  }

  async function removeRun(id: string) {
    if (await send({ acao: "remover-run", runId: id }, `run-${id}`)) {
      setRuns((current) => current.filter((r) => r.id !== id));
    }
  }

  return <div className="plan-editor">
    <form className="editor-form" onSubmit={(e) => e.preventDefault()}>
      <fieldset disabled={busy !== null}>
        <legend><Search size={15} /> Provedor de busca de estabelecimentos</legend>
        <div className="editor-checks">
          <label>
            <input type="radio" name="search_provider" checked={provider === "google_places"}
              onChange={() => saveProvider("google_places")} />
            Google Places API <small>(oficial, precisa de GOOGLE_PLACES_API_KEY)</small>
          </label>
          <label>
            <input type="radio" name="search_provider" checked={provider === "apify"}
              onChange={() => saveProvider("apify")} />
            Apify <small>(actor compass~crawler-google-places, precisa de APIFY_API_TOKEN)</small>
          </label>
        </div>
      </fieldset>

      <fieldset disabled={busy !== null}>
        <legend><Clapperboard size={15} /> Replay de busca (demonstração)</legend>
        <p className="editor-hint">
          Com o replay ativo, buscas feitas por <strong>contas admin</strong> retornam a run salva
          — sem chamar a API e sem cobrar créditos. Usuários comuns continuam na busca real.
          Ideal para gravar vídeos sem gastar tokens. Buscas reais feitas por admin ficam salvas aqui.
        </p>
        <div className="editor-checks">
          <label>
            <input type="checkbox" checked={replay}
              onChange={(e) => saveReplay(e.target.checked)} />
            Replay ativo {replay && <strong>(ligado — suas buscas não chamam a API)</strong>}
          </label>
        </div>
        <div className="editor-features">
          {runs.length === 0 && <p className="editor-hint">Nenhuma run salva. Faça uma busca real com a conta admin para gravar a primeira.</p>}
          {runs.map((run) => <div className="editor-feature" key={run.id}>
            <div>
              <strong>{run.query}</strong>
              <small>{run.provider === "apify" ? "Apify" : "Google Places"} · {run.resultados} resultados · {new Date(run.created_at).toLocaleString("pt-BR")}</small>
            </div>
            <button type="button" className="editor-remove" disabled={busy !== null}
              onClick={() => removeRun(run.id)}>
              <Trash2 size={15} />{busy === `run-${run.id}` ? "Removendo..." : "Remover"}
            </button>
          </div>)}
        </div>
      </fieldset>

      <fieldset disabled={busy !== null}>
        <legend><KeyRound size={15} /> Chaves de integração</legend>
        <p className="editor-hint">
          Valores definidos aqui sobrescrevem os secrets de ambiente em até 60s.
          Chaves vazias nas edge secrets também podem ser preenchidas aqui.
        </p>
        <div className="editor-fields">
          {KNOWN_KEYS.map(({ nome, descricao }) => {
            const existing = configured.get(nome) ?? secrets.find((s) => s.nome === nome);
            return <div className="editor-feature" key={nome}>
              <div>
                <strong>{nome}</strong>
                <small>{descricao}</small>
                <small>{existing ? `configurada ••••${existing.ultimos4}` : "não configurada"}</small>
              </div>
              <input
                type="password"
                autoComplete="off"
                maxLength={2000}
                placeholder={existing ? "Substituir valor" : "Cole a chave"}
                value={values[nome] ?? ""}
                onChange={(e) => setValues((current) => ({ ...current, [nome]: e.target.value }))}
              />
              <button type="button" className="button button-primary"
                disabled={busy !== null} onClick={() => saveSecret(nome)}>
                <Save size={15} />{busy === nome ? "Salvando..." : "Salvar"}
              </button>
              {existing && <button type="button" className="editor-remove"
                disabled={busy !== null} onClick={() => removeSecret(nome)}>
                <Trash2 size={15} />Remover
              </button>}
            </div>;
          })}
        </div>

        <label className="editor-block-label">Motivo da alteração
          <textarea required minLength={5} maxLength={300} rows={2} value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="Registrado na auditoria" />
        </label>
        {error && <p role="alert" className="auth-error">{error}</p>}
        {saved && <p role="status" className="editor-saved"><CheckCircle2 size={16} />{saved}</p>}
      </fieldset>
    </form>
  </div>;
}
