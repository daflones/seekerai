"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clapperboard, Copy, Check, Download, FilePlus2, Image as ImageIcon,
  Loader2, Monitor, Plus, RotateCcw, Smartphone, Globe, X,
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

export function StudioStudio({ t, lang = "pt", trial = false }: { t: T; lang?: string; trial?: boolean }) {
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
        ? <OutOfCredits lang={lang} trial={trial} />
        : <p className="st-err" role="alert">{error}</p>)}
    </div>

    {/* Resultado */}
    {project?.status === "done" && project.html && <div className="st-result">
      <div className="st-result-head">
        <h3>{t.preview} — {project.nome}</h3>
        <div className="st-view-switch">
          <button type="button" className={viewTarget === "web" ? "on" : ""}
            onClick={() => setPreview("web")}><Monitor size={14} /> {t.webView}</button>
          <button type="button" className={viewTarget === "mobile" ? "on" : ""}
            onClick={() => setPreview("mobile")}><Smartphone size={14} /> {t.mobileView}</button>
        </div>
      </div>
      <div className={`st-frame st-frame-${viewTarget}`}>
        <iframe title={project.nome} sandbox="allow-scripts allow-same-origin"
          srcDoc={project.html} />
      </div>
      <div className="st-actions">
        {project.site_slug
          ? <>
            <a className="st-btn st-btn-primary" href={`/site/${project.site_slug}`} target="_blank" rel="noreferrer">
              <Globe size={15} /> /site/{project.site_slug}
            </a>
            <a className="st-btn" href={`/app/dominios?site=${project.site_slug}`}>
              <Globe size={15} /> Domínio próprio
            </a>
            <button type="button" className="st-btn" onClick={() => void copyLink()}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t.copied : t.copyLink}
            </button>
          </>
          : <button type="button" className="st-btn st-btn-primary" onClick={() => void publish()} disabled={publishing}>
            {publishing ? <Loader2 size={15} className="spin" /> : <Globe size={15} />}
            {publishing ? t.publishing : t.publish}
          </button>}
        <button type="button" className="st-btn" onClick={download}><Download size={15} /> {t.download}</button>
        <button type="button" className="st-btn" onClick={() => void generate()} disabled={running}>
          <RotateCcw size={15} /> {t.regenerate}
        </button>
        <button type="button" className="st-btn" onClick={reset}><FilePlus2 size={15} /> {t.newApp}</button>
      </div>
    </div>}

    {/* Histórico */}
    {history.length > 0 && <section className="st-history">
      <h4>{t.historyTitle}</h4>
      <ul>
        {history.map(p => <li key={p.id}>
          <button type="button" onClick={async () => {
            const { project: full } = await api<{ project: Project | null }>(`/api/studio/generate?id=${p.id}`);
            if (full) { setProject(full); setPreview(full.target); window.scrollTo({ top: 0, behavior: "smooth" }); }
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
