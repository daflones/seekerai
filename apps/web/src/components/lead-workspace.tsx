"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Copy, Download, ExternalLink, Eye, ImagePlus, Instagram, Loader2, MapPin,
  MessageSquareText, Phone, Sparkles, Star, Trash2, Globe, MessageCircle,
  FileText, MonitorSmartphone,
} from "lucide-react";
import { callAction, LEAD_STATUS, placeImageSrc, type LeadRow } from "@/lib/app-client";
import { LeadAssistant } from "./lead-assistant";

interface OutputRow {
  id: string;
  tipo: "sales_reply" | "deep_strategy" | "generate_site" | "generate_image";
  conteudo: string;
  modelo: string | null;
  created_at: string;
}

const OUTPUT_LABEL: Record<string, string> = {
  sales_reply: "Mensagem de abordagem",
  deep_strategy: "Estratégia",
  generate_site: "Site gerado",
  generate_image: "Imagem",
};

function promptFor(tipo: string, lead: LeadRow, serviceName: string): string {
  const gap = lead.site ? "" : " O estabelecimento NÃO tem site — use isso como gancho principal.";
  switch (tipo) {
    case "sales_reply":
      return `Escreva uma mensagem curta de primeira abordagem via WhatsApp oferecendo ${serviceName} para este estabelecimento.` +
        `${gap} Tom humano, sem exageros, máximo 3 parágrafos curtos, terminando com uma pergunta simples.`;
    case "deep_strategy":
      return `Monte a estratégia de venda de ${serviceName} para este estabelecimento: diagnóstico, gaps observáveis,` +
        ` ângulo de abordagem, objeções prováveis e o próximo passo concreto.${gap}`;
    default:
      return `Crie o site institucional completo deste estabelecimento, pronto para publicar.` +
        ` Nome, categoria, endereço, telefone e avaliação estão no contexto — use-os de verdade.`;
  }
}

export function LeadWorkspace({ lead: initialLead, outputs: initialOutputs, serviceName, enabledActions, costs }: {
  lead: LeadRow;
  outputs: OutputRow[];
  serviceName: string;
  enabledActions: string[];
  costs: Record<string, number | null>;
}) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [outputs, setOutputs] = useState(initialOutputs);
  const [notas, setNotas] = useState(initialLead.notas ?? "");
  const [imagePrompt, setImagePrompt] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canSite = enabledActions.includes("generate_site");
  const siteCheck = (lead as LeadRow & {
    dados?: { siteCheck?: { estado?: string; sinais?: string[] } | null } | null;
  }).dados?.siteCheck ?? null;
  const siteCheckLabel = siteCheck?.estado === "desatualizado" ? "Site desatualizado"
    : siteCheck?.estado === "fora" ? "Site fora do ar"
    : siteCheck?.estado === "bom" ? "Site bom"
    : siteCheck?.estado === "ok" ? "Site comum" : null;
  const canImage = enabledActions.includes("generate_image");
  const waDigits = (lead.telefone ?? "").replace(/\D/g, "");
  const waLink = waDigits ? `https://wa.me/${waDigits.startsWith("55") ? waDigits : `55${waDigits}`}` : null;
  const waMsgLink = (text: string) =>
    waDigits ? `https://wa.me/${waDigits.startsWith("55") ? waDigits : `55${waDigits}`}?text=${encodeURIComponent(text)}` : null;
  const hasReply = outputs.some((o) => o.tipo === "sales_reply");
  const hasStrategy = outputs.some((o) => o.tipo === "deep_strategy");

  async function generate(tipo: "sales_reply" | "deep_strategy" | "generate_site") {
    if (busy) return;
    setBusy(tipo);
    setError("");
    setNotice("");
    const res = await callAction<{ conteudo?: string; modelo?: string; creditosCobrados?: number }>(
      "ai-generate",
      {
        action: tipo,
        serviceSlug: lead.service_slug,
        businessRef: lead.id,
        requestRef: crypto.randomUUID(),
        prompt: promptFor(tipo, lead, serviceName),
        context: {
          nome: lead.nome,
          categoria: lead.categoria,
          endereco: lead.endereco,
          cidade: lead.cidade,
          uf: lead.uf,
          telefone: lead.telefone,
          site: lead.site,
          avaliacao: lead.avaliacao,
          totalAvaliacoes: lead.total_avaliacoes,
          imagem: lead.imagem,
          mapsUrl: lead.maps_url,
        },
      },
    );
    if (!res.ok || !res.data.conteudo) {
      setBusy(null);
      setError(res.ok ? "A IA não devolveu conteúdo." : res.error);
      return;
    }
    const save = await fetch(`/api/leads/${lead.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, conteudo: res.data.conteudo, modelo: res.data.modelo ?? null }),
    });
    const saved = (await save.json().catch(() => null)) as { output?: OutputRow } | null;
    if (saved?.output) {
      setOutputs((list) => [{ ...saved.output!, conteudo: res.data.conteudo! }, ...list]);
      setOpen((o) => ({ ...o, [saved.output!.id]: true }));
    }
    setBusy(null);
    setNotice(`${OUTPUT_LABEL[tipo]} gerada${res.data.creditosCobrados ? ` · ${res.data.creditosCobrados} créditos` : " · grátis"}.`);
  }

  async function generateImage() {
    const prompt = imagePrompt.trim();
    if (busy || !prompt) return;
    setBusy("generate_image");
    setError("");
    setNotice("");
    const res = await callAction<{ imagens?: string[]; modelo?: string; creditosCobrados?: number }>(
      "ai-generate",
      {
        action: "generate_image",
        serviceSlug: lead.service_slug,
        businessRef: lead.id,
        requestRef: crypto.randomUUID(),
        prompt,
      },
    );
    const url = res.ok ? res.data.imagens?.[0] : null;
    if (!res.ok || !url) {
      setBusy(null);
      setError(res.ok ? "A IA não devolveu imagem." : res.error);
      return;
    }
    const save = await fetch(`/api/leads/${lead.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "generate_image", conteudo: url, modelo: res.data.modelo ?? null }),
    });
    const saved = (await save.json().catch(() => null)) as { output?: OutputRow } | null;
    if (saved?.output) {
      setOutputs((list) => [{ ...saved.output!, conteudo: url }, ...list]);
      setOpen((o) => ({ ...o, [saved.output!.id]: true }));
    }
    setImagePrompt("");
    setBusy(null);
    setNotice(`Imagem gerada${res.data.creditosCobrados ? ` · ${res.data.creditosCobrados} créditos` : ""}.`);
  }

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function removeLead() {
    if (busy || !confirm(`Remover o lead "${lead.nome}" e tudo que foi gerado para ele?`)) return;
    setBusy("delete");
    const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    if (res.ok) router.replace("/app/leads");
    else { setBusy(null); setError("Não foi possível remover."); }
  }

  function openSite(html: string) {
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  }

  function downloadSite(html: string) {
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${lead.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setNotice("Copiado.");
  }

  return <>
    <header className="lead-head">
      {placeImageSrc(lead.imagem) && <div className="lead-photo" style={{ backgroundImage: `url(${placeImageSrc(lead.imagem)})` }} role="img" aria-label={lead.nome} />}
      <div className="lead-head-main">
        <div className="lead-head-top">
          <h1>{lead.nome}</h1>
          <select
            aria-label="Status do lead"
            value={lead.status}
            className={`lead-status lead-status-${lead.status}`}
            onChange={(e) => { const status = e.target.value as LeadRow["status"]; setLead((l) => ({ ...l, status })); void patch({ status }); }}
          >
            {LEAD_STATUS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        {lead.categoria && <span className="seek-category">{lead.categoria} · {serviceName}</span>}
        {lead.endereco && <p className="seek-line"><MapPin size={12} />{[lead.endereco, lead.cidade, lead.uf].filter(Boolean).join(" · ")}</p>}
        <div className="lead-contacts">
          {lead.telefone && <a className="seek-badge seek-badge-ok" href={waLink ?? "#"} target="_blank" rel="noopener noreferrer"><Phone size={11} />{lead.telefone}</a>}
          {lead.whatsapp === "sim" && <span className="seek-badge seek-badge-ok"><MessageCircle size={11} />WhatsApp ativo</span>}
          {lead.whatsapp === "nao" && <span className="seek-badge">Sem WhatsApp</span>}
          {lead.avaliacao !== null && <span className="seek-badge"><Star size={11} />{lead.avaliacao.toFixed(1)}{lead.total_avaliacoes ? ` · ${lead.total_avaliacoes} avaliações` : ""}</span>}
          {lead.site
            ? <a className="seek-badge seek-badge-ok" href={lead.site} target="_blank" rel="noopener noreferrer"><Globe size={11} />Site atual<ExternalLink size={10} /></a>
            : <span className="seek-badge seek-badge-gap">Sem site — oportunidade</span>}
          {siteCheckLabel && <span
            className={`seek-badge ${siteCheck!.estado === "bom" ? "seek-badge-ok" : siteCheck!.estado === "ok" ? "" : "seek-badge-gap"}`}
            title={(siteCheck!.sinais ?? []).join(" · ")}>
            {siteCheckLabel}
          </span>}
          {lead.instagram && <a className="seek-badge" href={`https://instagram.com/${lead.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"><Instagram size={11} />{lead.instagram}</a>}
          {lead.maps_url && <a className="seek-badge" href={lead.maps_url} target="_blank" rel="noopener noreferrer"><MapPin size={11} />Maps<ExternalLink size={10} /></a>}
        </div>
      </div>
    </header>

    <section className="lead-actions">
      {!hasReply && <button type="button" className="button button-primary button-small" disabled={busy !== null}
        onClick={() => void generate("sales_reply")}>
        {busy === "sales_reply" ? <Loader2 size={14} className="spin" /> : <MessageSquareText size={14} />}
        Mensagem de abordagem{costs.sales_reply ? ` · ${costs.sales_reply}cr` : " · grátis"}
      </button>}
      {!hasStrategy && <button type="button" className="button button-glass button-small" disabled={busy !== null}
        onClick={() => void generate("deep_strategy")}>
        {busy === "deep_strategy" ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
        Estratégia{costs.deep_strategy ? ` · ${costs.deep_strategy}cr` : ""}
      </button>}
      {canSite && <button type="button" className="button button-glass button-small" disabled={busy !== null}
        onClick={() => void generate("generate_site")}>
        {busy === "generate_site" ? <Loader2 size={14} className="spin" /> : <MonitorSmartphone size={14} />}
        Gerar site{costs.generate_site ? ` · ${costs.generate_site}cr` : ""}
      </button>}
      <button type="button" className="button button-glass button-small lead-delete" disabled={busy !== null}
        onClick={() => void removeLead()}>
        <Trash2 size={14} />Remover
      </button>
    </section>

    {error && <p role="alert" className="auth-error">{error}</p>}
    {notice && <p role="status" className="editor-saved"><Sparkles size={14} />{notice}</p>}

    {canImage && <section className="lead-image-gen">
      <h2><ImagePlus size={17} /> Criar imagem</h2>
      <p className="seek-meta">Descreva a imagem que você precisa — a direção de arte profissional é aplicada automaticamente.</p>
      <div className="lead-image-row">
        <input
          value={imagePrompt}
          maxLength={2000}
          placeholder="Ex.: post de feed anunciando combo de corte + barba, tons escuros, estilo premium"
          onChange={(e) => setImagePrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void generateImage(); } }}
        />
        <button type="button" className="button button-primary button-small" disabled={busy !== null || !imagePrompt.trim()}
          onClick={() => void generateImage()}>
          {busy === "generate_image" ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />}
          Gerar{costs.generate_image ? ` · ${costs.generate_image}cr` : ""}
        </button>
      </div>
    </section>}

    <section className="lead-outputs">
      <h2>Gerado para este lead</h2>
      {outputs.length === 0 && <p className="seek-empty">Nada gerado ainda — comece pela mensagem de abordagem.</p>}
      {outputs.map((o) => <article key={o.id} className="lead-output">
        <button type="button" className="lead-output-head" onClick={() => setOpen((s) => ({ ...s, [o.id]: !s[o.id] }))}>
          <span>{OUTPUT_LABEL[o.tipo]}</span>
          <small>{new Date(o.created_at).toLocaleString("pt-BR")}{o.modelo ? ` · ${o.modelo}` : ""}</small>
        </button>
        {open[o.id] && <div className="lead-output-body">
          {o.tipo === "generate_site" && <div className="lead-output-actions">
            <button type="button" className="button button-glass button-small" onClick={() => openSite(o.conteudo)}><Eye size={14} />Abrir site</button>
            <button type="button" className="button button-glass button-small" onClick={() => downloadSite(o.conteudo)}><Download size={14} />Baixar HTML</button>
          </div>}
          {o.tipo === "generate_image" && <div className="lead-output-image">
            <Image src={o.conteudo} alt="Imagem gerada por IA" width={640} height={640} unoptimized
              style={{ width: "100%", height: "auto", borderRadius: 10 }} />
            <a className="button button-glass button-small" href={o.conteudo} download={`imagem-${o.id.slice(0, 8)}.png`} target="_blank" rel="noopener noreferrer">
              <Download size={14} />Baixar imagem
            </a>
          </div>}
          {(o.tipo === "sales_reply" || o.tipo === "deep_strategy") && <>
            <pre className="lead-output-text">{o.conteudo}</pre>
            <div className="lead-output-actions">
              <button type="button" className="button button-glass button-small" onClick={() => void copy(o.conteudo)}><Copy size={14} />Copiar</button>
              {o.tipo === "sales_reply" && waMsgLink(o.conteudo) && (
                <a className="button button-primary button-small lead-wa-send"
                  href={waMsgLink(o.conteudo)!} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={14} />Enviar no WhatsApp
                </a>
              )}
            </div>
          </>}
        </div>}
      </article>)}
    </section>

    <section className="lead-notes">
      <h2>Notas</h2>
      <textarea
        value={notas}
        maxLength={2000}
        placeholder="Anotações sobre a conversa, combinados, retornos…"
        onChange={(e) => setNotas(e.target.value)}
      />
      <button type="button" className="button button-glass button-small"
        disabled={busy !== null || notas === (lead.notas ?? "")}
        onClick={() => { void patch({ notas }); setLead((l) => ({ ...l, notas })); setNotice("Notas salvas."); }}>
        Salvar notas
      </button>
    </section>

    <LeadAssistant lead={lead} serviceName={serviceName} />
  </>;
}
