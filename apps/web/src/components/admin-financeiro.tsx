"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote, CheckCircle2, CreditCard, Loader2, QrCode,
  RefreshCw, Save, Trash2, TrendingUp, Wallet,
} from "lucide-react";

interface Chave { id: string; label: string; pixKeyMask: string; pix_key_type: string; hasDocument: boolean }
interface Saque { id: string; amount: number; pixKeyMask: string; pix_key_type: string; status: string; erro: string | null; created_at: string }

interface Data {
  saldo: number | null;
  receita: { cartao: number; pix: number };
  previsao: { proximoMes: number; trimestre: number; assinaturas: number };
  chaves: Chave[];
  saques: Saque[];
}

const TIPOS = [
  ["cpf", "CPF"],
  ["cnpj", "CNPJ"],
  ["email", "E-mail"],
  ["phone", "Telefone"],
  ["evp", "Aleatória (EVP)"],
  ["emv", "EMV"],
] as const;

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", concluido: "Enviado", falhou: "Falhou",
};

const brl = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AdminFinanceiro() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Nova chave
  const [kLabel, setKLabel] = useState("");
  const [kKey, setKKey] = useState("");
  const [kType, setKType] = useState<string>("cpf");
  const [kDoc, setKDoc] = useState("");
  // Saque
  const [valor, setValor] = useState("");
  const [keyMode, setKeyMode] = useState<"salva" | "nova">("salva");
  const [keyId, setKeyId] = useState("");
  const [sKey, setSKey] = useState("");
  const [sType, setSType] = useState<string>("cpf");
  const [sDoc, setSDoc] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/saque", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData((await res.json()) as Data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send(payload: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key);
    setError("");
    setNotice("");
    const res = await fetch("/api/admin/saque", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setBusy(null);
    if (!res?.ok) { setError(body?.error ?? "Não foi possível concluir."); return false; }
    setNotice(body?.message ?? "Feito.");
    await load();
    return true;
  }

  const docNeeded = (t: string) => ["phone", "email", "evp"].includes(t);

  return <>
    <div className="stat-grid">
      <section className="stat-card fin-saldo">
        <span className="stat-icon"><Wallet size={18} /></span>
        <small>SALDO SACÁVEL · MERCOSULPAY</small>
        <strong>{loading ? "…" : brl(data?.saldo ?? null)}</strong>
        <span className="stat-sub">Disponível para saque via PIX</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><QrCode size={18} /></span>
        <small>ENTRADAS VIA PIX</small>
        <strong>{loading ? "…" : brl(data?.receita.pix ?? 0)}</strong>
        <span className="stat-sub">MercosulPay — é esse saldo que sai no saque</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><CreditCard size={18} /></span>
        <small>ENTRADAS EM CARTÃO</small>
        <strong>{loading ? "…" : brl(data?.receita.cartao ?? 0)}</strong>
        <span className="stat-sub">Stripe — sacado pelo painel da Stripe</span>
      </section>
      <section className="stat-card">
        <span className="stat-icon"><TrendingUp size={18} /></span>
        <small>PREVISÃO PRÓXIMO MÊS</small>
        <strong>{loading ? "…" : brl(data?.previsao.proximoMes ?? 0)}</strong>
        <span className="stat-sub">
          {data ? `${data.previsao.assinaturas} assinatura${data.previsao.assinaturas === 1 ? "" : "s"} · ~${brl(data.previsao.trimestre)} em 3 meses` : "Assinaturas ativas mantidas"}
        </span>
      </section>
    </div>

    <div className="dash-grid">
      <section className="dash-panel">
        <h2><Banknote size={16} /> Sacar via PIX</h2>
        <p className="dash-hint">Sai do saldo MercosulPay. O recebedor é a chave escolhida abaixo.</p>
        <div className="editor-fields">
          <label className="editor-block-label">Valor (R$)
            <input inputMode="decimal" placeholder="0,00" value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))} />
          </label>
          <div className="editor-checks">
            <label>
              <input type="radio" checked={keyMode === "salva"} onChange={() => setKeyMode("salva")} />
              Usar chave salva
            </label>
            <label>
              <input type="radio" checked={keyMode === "nova"} onChange={() => setKeyMode("nova")} />
              Chave na hora
            </label>
          </div>
          {keyMode === "salva" && (
            (data?.chaves.length ?? 0) === 0
              ? <p className="dash-hint">Nenhuma chave salva — cadastre uma ao lado ou use &ldquo;Chave na hora&rdquo;.</p>
              : <label className="editor-block-label">Chave PIX
                  <select value={keyId} onChange={(e) => setKeyId(e.target.value)}>
                    <option value="">Escolha…</option>
                    {(data?.chaves ?? []).map((k) => (
                      <option key={k.id} value={k.id}>{k.label} · {k.pixKeyMask}</option>
                    ))}
                  </select>
                </label>
          )}
          {keyMode === "nova" && <>
            <label className="editor-block-label">Tipo
              <select value={sType} onChange={(e) => setSType(e.target.value)}>
                {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="editor-block-label">Chave PIX
              <input value={sKey} onChange={(e) => setSKey(e.target.value)} placeholder="CPF, e-mail, telefone ou aleatória" maxLength={200} />
            </label>
            {docNeeded(sType) && <label className="editor-block-label">CPF/CNPJ do recebedor
              <input value={sDoc} onChange={(e) => setSDoc(e.target.value.replace(/[^\d]/g, ""))} maxLength={14} inputMode="numeric" placeholder="Obrigatório pra esse tipo de chave" />
            </label>}
          </>}
          <button type="button" className="button button-primary"
            disabled={busy !== null}
            onClick={() => {
              const amount = Number(valor.replace(/\./g, "").replace(",", "."));
              if (!amount || amount <= 0) { setError("Informe um valor válido."); return; }
              if (keyMode === "salva" && !keyId) { setError("Escolha a chave PIX."); return; }
              void send({
                acao: "sacar",
                amount,
                ...(keyMode === "salva"
                  ? { keyId }
                  : { chave: { pix_key: sKey.trim(), pix_key_type: sType, recipient_document: sDoc || undefined } }),
              }, "sacar");
            }}>
            {busy === "sacar" ? <Loader2 size={15} className="spin" /> : <Banknote size={15} />}
            {busy === "sacar" ? "Enviando…" : "Sacar"}
          </button>
        </div>
      </section>

      <section className="dash-panel">
        <h2><Save size={16} /> Chaves PIX salvas</h2>
        {(data?.chaves ?? []).map((k) => (
          <div className="editor-feature" key={k.id}>
            <div>
              <strong>{k.label}</strong>
              <small>{TIPOS.find(([v]) => v === k.pix_key_type)?.[1] ?? k.pix_key_type} · {k.pixKeyMask}</small>
            </div>
            <button type="button" className="editor-remove" disabled={busy !== null}
              onClick={() => void send({ acao: "remover-chave", id: k.id }, `del-${k.id}`)}>
              <Trash2 size={14} />{busy === `del-${k.id}` ? "…" : "Remover"}
            </button>
          </div>
        ))}
        <div className="editor-fields" style={{ marginTop: 12 }}>
          <label className="editor-block-label">Nome da chave
            <input value={kLabel} onChange={(e) => setKLabel(e.target.value)} placeholder="Ex.: Nubank PJ" maxLength={80} />
          </label>
          <label className="editor-block-label">Tipo
            <select value={kType} onChange={(e) => setKType(e.target.value)}>
              {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="editor-block-label">Chave PIX
            <input value={kKey} onChange={(e) => setKKey(e.target.value)} maxLength={200} />
          </label>
          {docNeeded(kType) && <label className="editor-block-label">CPF/CNPJ do recebedor
            <input value={kDoc} onChange={(e) => setKDoc(e.target.value.replace(/[^\d]/g, ""))} maxLength={14} inputMode="numeric" />
          </label>}
          <button type="button" className="button button-glass" disabled={busy !== null}
            onClick={() => {
              if (!kLabel.trim() || !kKey.trim()) { setError("Preencha nome e chave."); return; }
              void send({
                acao: "salvar-chave",
                chave: { label: kLabel.trim(), pix_key: kKey.trim(), pix_key_type: kType, recipient_document: kDoc || undefined },
              }, "chave").then((ok) => { if (ok) { setKLabel(""); setKKey(""); setKDoc(""); } });
            }}>
            {busy === "chave" ? <Loader2 size={15} className="spin" /> : <Save size={15} />}Salvar chave
          </button>
        </div>
      </section>
    </div>

    {error && <p role="alert" className="auth-error">{error}</p>}
    {notice && <p role="status" className="editor-saved"><CheckCircle2 size={15} />{notice}</p>}

    <section className="dash-panel">
      <h2><RefreshCw size={16} /> Histórico de saques</h2>
      {(data?.saques.length ?? 0) === 0 && <p className="dash-empty">Nenhum saque ainda.</p>}
      <ul className="dash-usage">
        {(data?.saques ?? []).map((s) => (
          <li key={s.id}>
            <span>
              {brl(s.amount)} → {s.pixKeyMask}
              <small className="fin-saque-sub"> {new Date(s.created_at).toLocaleString("pt-BR")}{s.erro ? ` · ${s.erro}` : ""}</small>
            </span>
            <strong className={`fin-status fin-${s.status}`}>{STATUS_LABEL[s.status] ?? s.status}</strong>
          </li>
        ))}
      </ul>
    </section>
  </>;
}
