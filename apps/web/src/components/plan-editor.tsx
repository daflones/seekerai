"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Eye, Plus, Save, Trash2 } from "lucide-react";
import { cardContentSchema, formatPlanPrice, planEditSchema, type PlanCard } from "@/lib/plans/model";
import { type Currency, type IntlPrices, type Locale } from "@/lib/i18n/shared";
import { PlanCardView } from "./plan-card";

const INTL_CURS = ["usd", "eur", "gbp"] as const;
const INTL_LABEL: Record<(typeof INTL_CURS)[number], string> = { usd: "US$", eur: "€", gbp: "£" };
const fmtIntl = (cents?: number) => (cents ? (cents / 100).toFixed(2) : "");

// Locales de prévia — um por moeda, pra mostrar o card como o visitante vê.
const PREVIEW_LOCALES: Record<Currency, Locale> = {
  brl: { lang: "pt", currency: "brl", region: "BR", isBrazil: true },
  usd: { lang: "en", currency: "usd", region: "US", isBrazil: false },
  eur: { lang: "en", currency: "eur", region: "DE", isBrazil: false },
  gbp: { lang: "en", currency: "gbp", region: "GB", isBrazil: false },
};

function cents(value: string): number | null {
  const normalized = value.trim().includes(",") ? value.trim().replace(/\./g, "").replace(",", ".") : value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const result = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(result) && result <= 10_000_000 ? result : null;
}

export function PlanEditor({ initialPlans }: { initialPlans: PlanCard[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [selected, setSelected] = useState(initialPlans[0].slug);
  const [prices, setPrices] = useState(Object.fromEntries(initialPlans.map((plan) => [plan.slug, formatPlanPrice(plan.priceCents)])));
  const [intl, setIntl] = useState(() => Object.fromEntries(initialPlans.map((plan) => [plan.slug, {
    usd: fmtIntl(plan.intlPrices?.usd), eur: fmtIntl(plan.intlPrices?.eur), gbp: fmtIntl(plan.intlPrices?.gbp),
  }])) as Record<string, Record<(typeof INTL_CURS)[number], string>>);
  const [cur, setCur] = useState<Currency>("brl");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const plan = plans.find((item) => item.slug === selected)!;

  function change(update: Partial<PlanCard>) {
    setSaved("");
    setPlans((items) => items.map((item) => item.slug === selected ? { ...item, ...update } : item));
  }
  function content(update: Partial<PlanCard["content"]>) { change({ content: { ...plan.content, ...update } }); }
  function feature(index: number, update: Partial<PlanCard["content"]["features"][number]>) {
    content({ features: plan.content.features.map((item, i) => i === index ? { ...item, ...update } : item) });
  }
  function move(index: number, direction: number) {
    const features = [...plan.content.features];
    [features[index], features[index + direction]] = [features[index + direction], features[index]];
    content({ features });
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSaved("");
    const price = cents(prices[selected]);
    if (price === null) { setError("Informe um preço válido, como 49,90."); return; }
    if (plan.slug === "gratis" && price !== 0) { setError("O plano Grátis precisa continuar com preço zero."); return; }
    const intlPrices: IntlPrices = {};
    for (const c of INTL_CURS) {
      const raw = intl[selected]?.[c]?.trim() ?? "";
      if (!raw) continue;
      const v = cents(raw);
      if (v === null) { setError(`Preço ${INTL_LABEL[c]} inválido — use o formato 9.90 ou deixe vazio.`); return; }
      intlPrices[c] = v;
    }
    const parsed = planEditSchema.safeParse({
      id: plan.id, name: plan.name, priceCents: price, order: plan.order,
      featured: plan.featured, visible: plan.visible, content: plan.content, revision: plan.revision, reason,
      intlPrices,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Revise os campos."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Não foi possível salvar."); return; }
      change({ revision: result.revision, priceCents: price, intlPrices });
      setSaved("Salvo. A landing e o cadastro passam a ler essa configuração."); setReason("");
    } catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setSaving(false); }
  }
  function setIntlPrice(c: (typeof INTL_CURS)[number], value: string) {
    const current = Object.fromEntries(INTL_CURS.map((k) => [k, intl[selected]?.[k] ?? ""])) as Record<(typeof INTL_CURS)[number], string>;
    current[c] = value;
    setIntl({ ...intl, [selected]: current });
  }
  const previewIntl: IntlPrices = {};
  for (const c of INTL_CURS) {
    const v = cents(intl[selected]?.[c] ?? "");
    if (v !== null) previewIntl[c] = v;
  }
  const preview = { ...plan, priceCents: cents(prices[selected]) ?? plan.priceCents, intlPrices: previewIntl };
  const validPreview = cardContentSchema.safeParse(preview.content).success;
  const previewLocale = PREVIEW_LOCALES[cur];

  return <div className="plan-editor">
    <div className="editor-plan-tabs" role="group" aria-label="Plano em edição">{plans.map((item) => <button key={item.slug} type="button" disabled={saving} aria-pressed={selected === item.slug} onClick={() => { setSelected(item.slug); setError(""); setSaved(""); setReason(""); }}>{item.name}<small>{item.visible ? "Publicado" : "Rascunho"}</small></button>)}</div>
    <div className="editor-layout">
      <form className="editor-form" onSubmit={save}>
        <fieldset disabled={saving}><legend>Oferta do plano</legend><div className="editor-fields">
          <label>Nome<input value={plan.name} maxLength={60} onChange={(event) => change({ name: event.target.value })} /></label>
          <label>Preço mensal (R$)<input inputMode="decimal" value={prices[selected]} onChange={(event) => { const value = event.target.value; setPrices({ ...prices, [selected]: value }); const price = cents(value); if (price !== null) change({ priceCents: price }); }} /></label>
          {INTL_CURS.map((c) => <label key={c}>Preço mensal ({INTL_LABEL[c]}) — visitante internacional<input inputMode="decimal" placeholder="Vazio = não vende nessa moeda" value={intl[selected]?.[c] ?? ""} onChange={(event) => setIntlPrice(c, event.target.value)} /></label>)}
          <label>Ordem na landing<input type="number" min={0} max={99} value={plan.order} onChange={(event) => change({ order: Number(event.target.value) })} /></label>
          <label>Selo<input value={plan.content.badge} maxLength={40} onChange={(event) => content({ badge: event.target.value })} placeholder="Ex.: Mais popular" /></label>
        </div><label className="editor-block-label">Descrição<textarea maxLength={180} rows={3} value={plan.content.description} onChange={(event) => content({ description: event.target.value })} /></label>
        <div className="editor-checks"><label><input type="checkbox" checked={plan.visible} onChange={(event) => change({ visible: event.target.checked })} />Publicar na landing</label><label><input type="checkbox" checked={plan.featured} onChange={(event) => change({ featured: event.target.checked })} />Destacar este plano</label></div>
        </fieldset>
        <fieldset disabled={saving}><legend>Identidade do card</legend><div className="editor-fields">
          <label>Tema<select value={plan.content.theme} onChange={(event) => content({ theme: event.target.value as PlanCard["content"]["theme"] })}><option value="cream">Claro · primeiro passo</option><option value="teal">Petróleo · constância</option><option value="violet">Violeta · destaque</option><option value="gold">Âmbar · máximo</option></select></label>
          <label>Estilo do botão<select value={plan.content.buttonStyle} onChange={(event) => content({ buttonStyle: event.target.value as PlanCard["content"]["buttonStyle"] })}><option value="solid">Sólido na cor do tema</option><option value="light">Claro</option><option value="outline">Contorno</option></select></label>
        </div><label className="editor-block-label">Texto do botão<input maxLength={50} value={plan.content.cta} onChange={(event) => content({ cta: event.target.value })} /></label></fieldset>
        <fieldset disabled={saving}><legend>Benefícios e elementos</legend><p className="editor-hint">Reordene, oculte e destaque recursos. Textos não alteram permissões ou limites do plano.</p>
          <div className="editor-features">{plan.content.features.map((item, index) => <div className="editor-feature" key={item.id}>
            <input aria-label={`Texto do benefício ${index + 1}`} maxLength={140} value={item.text} onChange={(event) => feature(index, { text: event.target.value })} />
            <div><select aria-label={`Ícone do benefício ${index + 1}`} value={item.icon} onChange={(event) => feature(index, { icon: event.target.value as typeof item.icon })}><option value="check">Confirmação</option><option value="bot">Agente de IA</option><option value="sparkles">Inteligência</option><option value="globe">Web / portfólio</option></select>
              <label><input type="checkbox" checked={item.highlight} onChange={(event) => feature(index, { highlight: event.target.checked })} />Destaque</label>
              <label><input type="checkbox" checked={item.visible} onChange={(event) => feature(index, { visible: event.target.checked })} />Visível</label>
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Subir benefício ${index + 1}`}><ArrowUp size={14} /></button>
              <button type="button" disabled={index === plan.content.features.length - 1} onClick={() => move(index, 1)} aria-label={`Descer benefício ${index + 1}`}><ArrowDown size={14} /></button>
              <button type="button" disabled={plan.content.features.length <= 1} onClick={() => content({ features: plan.content.features.filter((_, i) => i !== index) })} aria-label={`Remover benefício ${index + 1}`}><Trash2 size={14} /></button>
            </div></div>)}</div>
          <button className="editor-add" type="button" disabled={plan.content.features.length >= 12} onClick={() => content({ features: [...plan.content.features, { id: `recurso-${crypto.randomUUID().slice(0, 8)}`, text: "Novo benefício", icon: "check", highlight: false, visible: true }] })}><Plus size={15} />Adicionar benefício</button>
        </fieldset>
        <label className="editor-block-label">Motivo da alteração<textarea required minLength={5} maxLength={300} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Registrado na auditoria" /></label>
        <p className="editor-hint">Publicar não ativa cobranças. Valores e recursos de créditos permanecem dentro da plataforma, fora do marketing.</p>
        {error && <p role="alert" className="auth-error">{error}</p>}
        {saved && <p role="status" className="editor-saved"><CheckCircle2 size={16} />{saved}</p>}
        <button className="button button-primary" disabled={saving}><Save size={16} />{saving ? "Salvando..." : "Salvar plano e card"}</button>
      </form>
      <aside className="editor-preview"><span><Eye size={15} />PRÉVIA EM TEMPO REAL</span>
        <div className="editor-cur-tabs" role="group" aria-label="Moeda da prévia">
          {(["brl", "usd", "eur", "gbp"] as const).map((c) => <button key={c} type="button" aria-pressed={cur === c} onClick={() => setCur(c)}>{c === "brl" ? "R$" : INTL_LABEL[c]}</button>)}
        </div>
        {validPreview ? <PlanCardView plan={preview} preview locale={previewLocale} perMonth={cur === "brl" ? "/ mês" : "/ month"} freeSuffix={cur === "brl" ? "/ para conhecer" : "/ to explore"} freeNote={cur === "brl" ? "Conheça antes de decidir." : "Explore before deciding."} paidNote={cur === "brl" ? "Sua próxima fase, no seu ritmo." : "Your next phase, at your pace."} /> : <p className="auth-notice">Revise os textos e mantenha ao menos um benefício visível para visualizar.</p>}<p>A prévia não inicia cadastro ou cobrança.</p></aside>
    </div>
  </div>;
}
