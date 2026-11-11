"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clapperboard, Copy, Check, Download, FilePlus2, History, Image as ImageIcon,
  Loader2, Monitor, Paintbrush, Plus, RotateCcw, Smartphone, Globe, Trophy, X,
} from "lucide-react";
import type { Messages } from "@/lib/i18n/messages";
import { isCreditsError, OutOfCredits } from "./out-of-credits";

type T = Messages["studio"];
type Target = "web" | "mobile";

interface Ref { url: string; kind: "image" | "video"; }
interface Project {
  id: string; status: "running" | "done" | "error";
  html: string | null; erro: string | null; nome: string;
  target: Target; site_slug: string | null; created_at: string;
  lead_id?: string | null; ganho_em?: string | null;
  leads?: { nome?: string } | null;
}

const MAX_IMG = 6;
const MAX_VID = 2;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Erro ${res.status}`);
  return data as T;
}

function guessName(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

export function StudioStudio({ t, lang = "pt", trial = false, dailyActive = true }: { t: T; lang?: string; trial?: boolean; dailyActive?: boolean }) {
  const [target, setTarget] = useState<Target>("web");
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<Ref[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<Project[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<Target | null>(null);
  const [wonOpen, setWonOpen] = useState(false);
  const [wonBusy, setWonBusy] = useState(false);
  const [wonLeads, setWonLeads] = useState<{ id: string; nome: string }[]>([]);
  const [wonLeadId, setWonLeadId] = useState("");
  const [wonNewName, setWonNewName] = useState("");
  const [wonError, setWonError] = useState("");
  const [wonClient, setWonClient] = useState("");
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const imgCount = refs.filter(r => r.kind === "image").length;
  const vidCount = refs.filter(r => r.kind === "video").length;
  const canGenerate = prompt.trim().length >= 10 && !running && !uploading;

  const refreshHistory = useCallback(async () => {
    try {
      const { projects } = await api<{ projects: Project[] }>("/api/studio/generate");
      setHistory(projects);
    } catch { /* histórico é best-effort */ }
  }, []);

  useEffect(() => {
    void refreshHistory();
    const openId = new URLSearchParams(window.location.search).get("p");
    if (openId) {
      void (async () => {
        try {
          const { project: p } = await api<{ project: Project | null }>(`/api/studio/generate?id=${openId}`);
          if (!p) return;
          setProject(p);
          setWonClient("");
          if (p.status === "running") { setRunning(true); startPoll(p.id); }
          else if (p.status === "error") setError(p.erro ?? t.failed);
          else setPreview(p.target);
        } catch { /* ignora — histórico continua disponível */ }
      })();
    }
    const close = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setAttachOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => { document.removeEventListener("mousedown", close); stopPoll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPoll(id: string) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const { project: p } = await api<{ project: Project | null }>(`/api/studio/generate?id=${id}`);
        if (!p) return;
        if (p.status === "running") return;
        stopPoll();
        setRunning(false);
        setProject(p);
        if (p.status === "error") setError(p.erro ?? t.failed);
        else setPreview(p.target);
        void refreshHistory();
      } catch { /* tenta no próximo tick */ }
    }, 3000);
  }

  async function onPick(files: FileList | null, kind: "image" | "video") {
    if (!files?.length) return;
    const cap = kind === "image" ? MAX_IMG : MAX_VID;
    const have = kind === "image" ? imgCount : vidCount;
    const room = cap - have;
    if (room <= 0) { setError(t.refsLimit); return; }
    setError("");
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/studio/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : t.failed);
        setRefs(prev => [...prev, { url: data.url as string, kind: data.kind as "image" | "video" }]);
      }
      if (files.length > room) setError(t.refsLimit);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setUploading(false);
      if (imgInput.current) imgInput.current.value = "";
      if (vidInput.current) vidInput.current.value = "";
    }
  }

  async function generate() {
    if (!canGenerate) return;
    setError("");
    setRunning(true);
    setProject(null);
    try {
      const { projectId } = await api<{ projectId: string }>("/api/studio/generate", {
        nome: guessName(prompt),
        prompt: prompt.trim(),
        target,
        refs,
      });
      startPoll(projectId);
    } catch (e) {
      setRunning(false);
      setError(e instanceof Error ? e.message : t.failed);
    }
  }

  async function publish() {
    if (!project || publishing) return;
    setPublishing(true);
    setError("");
    try {
      const { slug } = await api<{ slug: string }>("/api/studio/publish", { projectId: project.id });
      setProject({ ...project, site_slug: slug });
      void refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setPublishing(false);
    }
  }

  function download() {
    if (!project?.html) return;
    const blob = new Blob([project.html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.nome.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "app"}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function openWon() {
    setWonOpen(v => !v);
    if (wonLeads.length === 0) {
      try {
        const d = await api<{ leads?: { id: string; nome: string }[] }>("/api/criacoes?size=6");
        setWonLeads(d.leads ?? []);
      } catch { /* seletor fica vazio — ainda dá pra criar cliente novo */ }
    }
  }

  async function markWon() {
    if (!project || wonBusy) return;
    setWonBusy(true);
    setWonError("");
    try {
      const { lead } = await api<{ lead: { id: string; nome: string } }>("/api/studio/won", {
        projectId: project.id,
        ...(wonLeadId ? { leadId: wonLeadId } : { clientName: wonNewName.trim() }),
      });
      setWonClient(lead.nome);
      setProject({ ...project, ganho_em: new Date().toISOString(), lead_id: lead.id });
      setWonOpen(false);
    } catch (e) {
      setWonError(e instanceof Error ? e.message : t.wonErr);
    } finally {
      setWonBusy(false);
    }
  }

  async function copyLink() {
    if (!project?.site_slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/site/${project.site_slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard indisponível */ }
  }

  function reset() {
    stopPoll();
    setProject(null); setPrompt(""); setRefs([]);
    setError(""); setRunning(false); setPreview(null);
  }

  const viewTarget = preview ?? project?.target ?? "web";

  return <div className="st">
    {/* Seletor de plataforma */}
    <div className="st-targets" role="radiogroup" aria-label="Plataforma">
      <button type="button" role="radio" aria-checked={target === "web"}
        className={`st-target${target === "web" ? " on" : ""}`} onClick={() => setTarget("web")}>
        <Monitor size={18} />
        <span><b>{t.webTarget}</b><small>{t.webTargetHint}</small></span>
      </button>
      <button type="button" role="radio" aria-checked={target === "mobile"}
        className={`st-target${target === "mobile" ? " on" : ""}`} onClick={() => setTarget("mobile")}>
        <Smartphone size={18} />
        <span><b>{t.mobileTarget}</b><small>{t.mobileTargetHint}</small></span>
      </button>
    </div>

    {/* Composer */}
    <div className="st-composer">
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder={t.promptPh}
        rows={4}
        disabled={running}
      />
      {refs.length > 0 && <div className="st-refs">
        {refs.map((r, i) => <div key={r.url} className="st-ref">
          {r.kind === "image"
            // eslint-disable-next-line @next/next/no-img-element -- thumbnail pequeno de referência
            ? <img src={r.url} alt="" loading="lazy" />
            : <span className="st-ref-vid"><Clapperboard size={16} /></span>}
          <button type="button" className="st-ref-x" aria-label="Remover"
            onClick={() => setRefs(prev => prev.filter((_, j) => j !== i))}>
            <X size={12} />
          </button>
        </div>)}
      </div>}
      <div className="st-bar">
        <div className="st-attach" ref={popRef}>
          <button type="button" className="st-plus" aria-label={t.attach}
            onClick={() => setAttachOpen(v => !v)} disabled={uploading || running}>
            {uploading ? <Loader2 size={18} className="spin" /> : <Plus size={18} />}
          </button>
          {attachOpen && <div className="st-pop">
            <button type="button" onClick={() => { imgInput.current?.click(); setAttachOpen(false); }}
              disabled={imgCount >= MAX_IMG}>
              <ImageIcon size={15} /> {t.attachImg} <small>{imgCount}/{MAX_IMG}</small>
            </button>
            <button type="button" onClick={() => { vidInput.current?.click(); setAttachOpen(false); }}
              disabled={vidCount >= MAX_VID}>
              <Clapperboard size={15} /> {t.attachVid} <small>{vidCount}/{MAX_VID}</small>
            </button>
          </div>}
          <input ref={imgInput} type="file" accept="image/*" multiple hidden
            onChange={e => void onPick(e.target.files, "image")} />
          <input ref={vidInput} type="file" accept="video/*" multiple hidden
            onChange={e => void onPick(e.target.files, "video")} />
          <span className="st-hint">{t.refsHint}</span>
        </div>
        <button type="button" className="st-go" onClick={() => void generate()} disabled={!canGenerate}>
          {running ? <><Loader2 size={16} className="spin" /> {t.generating}</>
            : <>{t.generate} <small>· {t.costNote}</small></>}
        </button>
      </div>
      {uploading && <p className="st-note"><Loader2 size={13} className="spin" /> {t.uploading}</p>}
      {running && <p className="st-note"><Loader2 size={13} className="spin" /> {t.runningStatus}</p>}
      {error && (isCreditsError(error)
        ? <OutOfCredits lang={lang} trial={trial} expired={trial && !dailyActive} />
        : <p className="auth-error" role="alert">{error}</p>)}
    </div>

    {/* Resultado: toolbar + moldura de dispositivo */}
    {project?.status === "done" && project.html && <div className="st-result">
      <div className="st-result-toolbar">
        <div className="st-view-switch" role="group" aria-label={t.preview}>
          <button type="button" className={viewTarget === "web" ? "on" : ""}
            onClick={() => setPreview("web")} title={t.webView}><Monitor size={14} /> {t.webView}</button>
          <button type="button" className={viewTarget === "mobile" ? "on" : ""}
            onClick={() => setPreview("mobile")} title={t.mobileView}><Smartphone size={14} /> {t.mobileView}</button>
        </div>
        <span className="st-result-title" title={project.nome}>{project.nome}</span>
        <div className="st-actions">
          {project.site_slug
            ? <>
              <a className="st-btn" href={`/site/${project.site_slug}`} target="_blank" rel="noreferrer" title={`/site/${project.site_slug}`}>
                <Globe size={14} /><span>{t.openSite}</span>
              </a>
              <a className="st-btn st-btn-edit" href={`/app/sites/${project.site_slug}/editar`} title={t.editSite}>
                <Paintbrush size={14} /><span>{t.editSite}</span>
              </a>
              <button type="button" className="st-btn" onClick={() => void copyLink()} title={t.copyLink}>
                {copied ? <Check size={14} /> : <Copy size={14} />}<span>{copied ? t.copied : t.copyLink}</span>
              </button>
              <a className="st-btn" href={`/app/dominios?site=${project.site_slug}`} title={t.ownDomain}>
                <Globe size={14} /><span>{t.ownDomain}</span>
              </a>
            </>
            : <button type="button" className="st-btn st-btn-primary" onClick={() => void publish()} disabled={publishing}>
              {publishing ? <Loader2 size={14} className="spin" /> : <Globe size={14} />}
              <span>{publishing ? t.publishing : t.publish}</span>
            </button>}
          <button type="button" className="st-btn" onClick={download} title={t.download}>
            <Download size={14} /><span>{t.download}</span>
          </button>
          <button type="button" className="st-btn" onClick={() => void generate()} disabled={running} title={t.regenerate}>
            <RotateCcw size={14} /><span>{t.regenerate}</span>
          </button>
          {project.ganho_em
            ? <span className="st-won-badge" title={t.wonBadge}>
              <Trophy size={14} />
              <span>{t.wonBadge}{(wonClient || project.leads?.nome) ? ` · ${wonClient || project.leads?.nome}` : ""}</span>
            </span>
            : <button type="button" className="st-btn st-btn-won" onClick={() => void openWon()} title={t.won}>
              <Trophy size={14} /><span>{t.won}</span>
            </button>}
          <button type="button" className="st-btn" onClick={reset} title={t.newApp}>
            <FilePlus2 size={14} /><span>{t.newApp}</span>
          </button>
        </div>
      </div>
      {wonOpen && !project.ganho_em && <div className="st-won">
        <p className="st-won-t">{t.wonT} <small>{t.wonHint}</small></p>
        <div className="st-won-row">
          <select
            value={wonLeadId}
            onChange={e => { setWonLeadId(e.target.value); if (e.target.value) setWonNewName(""); }}
            aria-label={t.wonPick}
          >
            <option value="">{t.wonPick}</option>
            {wonLeads.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <span className="st-won-or">{t.wonOr}</span>
          <input
            value={wonNewName}
            onChange={e => { setWonNewName(e.target.value); if (e.target.value) setWonLeadId(""); }}
            placeholder={t.wonNamePh}
            maxLength={200}
          />
          <button type="button" className="st-btn st-btn-primary"
            disabled={wonBusy || (!wonLeadId && !wonNewName.trim())}
            onClick={() => void markWon()}>
            {wonBusy ? <Loader2 size={14} className="spin" /> : <Trophy size={14} />}
            <span>{wonBusy ? t.wonSaving : t.wonSave}</span>
          </button>
        </div>
        {wonError && <p className="auth-error" role="alert" style={{ margin: 0 }}>{wonError}</p>}
      </div>}
      <div className={`st-stage st-stage-${viewTarget}`}>
        {viewTarget === "mobile"
          ? <div className="st-device st-device-phone">
            <span className="st-phone-notch" />
            <iframe title={project.nome} sandbox="allow-scripts allow-same-origin" srcDoc={project.html} />
          </div>
          : <div className="st-device st-device-browser">
            <div className="st-device-bar">
              <i /><i /><i />
              <span className="st-device-url">{project.site_slug ? `seekerai.digital/site/${project.site_slug}` : t.previewUrl}</span>
            </div>
            <iframe title={project.nome} sandbox="allow-scripts allow-same-origin" srcDoc={project.html} />
          </div>}
      </div>
    </div>}

    {/* Histórico */}
    {history.length > 0 && <section className="dash-panel st-history">
      <div className="dash-panel-heading"><h2><History size={15} /> {t.historyTitle}</h2></div>
      <ul>
        {history.map(p => <li key={p.id}>
          <button type="button" onClick={async () => {
            const { project: full } = await api<{ project: Project | null }>(`/api/studio/generate?id=${p.id}`);
            if (full) {
              setProject(full); setPreview(full.target); setWonClient(""); setWonOpen(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}>
            {p.target === "mobile" ? <Smartphone size={14} /> : <Monitor size={14} />}
            <span className="st-h-name">{p.nome || t.untitled}</span>
            <span className={`st-h-status st-h-${p.status}`}>{p.status}</span>
            {p.site_slug && <Globe size={13} />}
          </button>
        </li>)}
      </ul>
    </section>}
  </div>;
}
