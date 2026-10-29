"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, RotateCcw, Save } from "lucide-react";
import type grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import type { Messages } from "@/lib/i18n/messages";

type GjsEditor = ReturnType<typeof grapesjs.init>;
type T = Messages["siteEdit"];

// Editor visual do site do lead/estúdio (GrapesJS): edita texto inline,
// troca imagens, arrasta/redimensiona/duplica elementos e adiciona
// blocos novos. Salva o HTML final em config.html — o /site serve via
// iframe como tipo "custom".
export function SiteEditor({ slug, nome, t }: { slug: string; nome: string; t: T }) {
  const holder = useRef<HTMLDivElement>(null);
  const editorRef = useRef<GjsEditor | null>(null);
  const headRef = useRef("");
  const scriptsRef = useRef("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "restoring">("loading");
  const [canRestore, setCanRestore] = useState(false);
  const [notice, setNotice] = useState("");
  const [fail, setFail] = useState("");

  useEffect(() => {
    let destroyed = false;
    let editor: GjsEditor | null = null;
    (async () => {
      const [{ default: grapesjs }, { default: blocksBasic }] = await Promise.all([
        import("grapesjs"), import("grapesjs-blocks-basic"),
      ]);
      const res = await fetch(`/api/sites/${slug}/edit`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.doc || destroyed) { setFail(data.error ?? t.loadFail); return; }

      const parsed = new DOMParser().parseFromString(data.doc, "text/html");
      const cssText = [...parsed.querySelectorAll("style")]
        .map((s) => s.textContent ?? "").join("\n");
      const links = [...parsed.querySelectorAll('link[rel="stylesheet"]')]
        .map((l) => l.getAttribute("href")).filter((h): h is string => Boolean(h))
        .map((h) => new URL(h, window.location.origin).href);
      headRef.current = [...parsed.querySelectorAll("head link")]
        .map((l) => l.outerHTML).join("\n");
      // Scripts saem do canvas (não executam e o editor os mutila) e
      // voltam intactos no save — lightbox/tracking do site sobrevivem.
      scriptsRef.current = [...parsed.querySelectorAll("script")]
        .map((s) => s.outerHTML).join("\n");
      parsed.querySelectorAll("script").forEach((s) => s.remove());
      const bodyHtml = parsed.body.innerHTML;
      if (destroyed) return;

      editor = grapesjs.init({
        container: holder.current as HTMLElement,
        height: "100%",
        width: "auto",
        storageManager: false,
        plugins: [blocksBasic],
        canvas: { styles: links },
        deviceManager: {
          devices: [
            { name: "Desktop", width: "" },
            { name: "Tablet", width: "768px", widthMedia: "992px" },
            { name: "Mobile", width: "380px", widthMedia: "575px" },
          ],
        },
        assetManager: {
          // O endpoint aceita 1 arquivo por request — um fetch por arquivo.
          // `clb` devolve as URLs pro editor (atribui a imagem e fecha o modal).
          uploadFile: async (e, clb, opts) => {
            const files: File[] = opts?.file ? [opts.file]
              : e.dataTransfer?.files?.length ? Array.from(e.dataTransfer.files)
              : Array.from((e.target as HTMLInputElement | null)?.files ?? []);
            const urls: string[] = [];
            for (const f of files) {
              const form = new FormData();
              form.append("file", f);
              const d = await fetch("/api/studio/upload", { method: "POST", body: form })
                .then((r) => r.json()).catch(() => ({}));
              if (d.url) urls.push(d.url);
            }
            if (urls.length) clb?.({ data: urls });
          },
        },
      });

      editor.setComponents(bodyHtml);
      if (cssText) editor.setStyle(cssText);

      // Blocos extras além do básico (colunas, texto, imagem, vídeo, mapa).
      const B = editor.BlockManager;
      B.add("sk-heading", {
        label: t.bHeading, category: "Seeker",
        content: { tagName: "h2", content: t.bHeading, style: { margin: "0 0 12px", "font-size": "32px" } },
      });
      B.add("sk-button", {
        label: t.bButton, category: "Seeker",
        content: `<a href="#" style="display:inline-block;padding:13px 26px;border-radius:12px;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;">${t.bButton}</a>`,
      });
      B.add("sk-whatsapp", {
        label: t.bWhatsapp, category: "Seeker",
        content: `<a href="https://wa.me/" target="_blank" rel="noopener" style="display:inline-block;padding:13px 26px;border-radius:12px;background:#22c55e;color:#fff;text-decoration:none;font-weight:700;">${t.bWhatsapp}</a>`,
      });
      B.add("sk-section", {
        label: t.bSection, category: "Seeker",
        content: `<section style="padding:56px 24px;"><h2 style="margin:0 0 10px;">${t.bSection}</h2><p style="margin:0;">${t.bSection}</p></section>`,
      });
      B.add("sk-divider", {
        label: t.bDivider, category: "Seeker",
        content: { tagName: "hr", style: { border: "0", "border-top": "1px solid rgba(0,0,0,.15)", margin: "32px 0" } },
      });

      editorRef.current = editor;
      setCanRestore(Boolean(data.canRestore));
      setStatus("ready");
    })().catch(() => setFail(t.loadFail));
    return () => { destroyed = true; editor?.destroy(); editorRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const buildDoc = () => {
    const editor = editorRef.current;
    if (!editor) return "";
    return `<!doctype html><html lang="pt"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${nome.replace(/</g, "")}</title>${headRef.current}` +
      `<style>${editor.getCss()}</style></head><body>${editor.getHtml()}${scriptsRef.current}</body></html>`;
  };

  const save = async () => {
    if (!editorRef.current || status === "saving") return;
    setStatus("saving");
    setNotice(""); setFail("");
    const res = await fetch(`/api/sites/${slug}/edit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: buildDoc() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setNotice(t.saved); setCanRestore(Boolean(data.canRestore ?? true)); setStatus("ready"); }
    else { setFail(data.error ?? t.saveFail); setStatus("ready"); }
  };

  const restore = async () => {
    if (status === "restoring" || !window.confirm(t.restoreAsk)) return;
    setStatus("restoring");
    setNotice(""); setFail("");
    const res = await fetch(`/api/sites/${slug}/edit`, { method: "DELETE" });
    if (res.ok) { window.location.reload(); return; }
    setFail(t.saveFail);
    setStatus("ready");
  };

  return <div className="site-editor">
    <div className="site-editor-bar">
      <Link href="/app" className="text-link"><ArrowLeft size={14} />{t.back}</Link>
      <span className="site-editor-title">{t.title} — <strong>{nome}</strong></span>
      <span className="site-editor-hint">{t.hint}</span>
      <div className="site-editor-actions">
        {canRestore && (
          <button type="button" className="button button-glass button-small" onClick={() => void restore()}
            disabled={status !== "ready"}>
            {status === "restoring" ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
            {t.restore}
          </button>
        )}
        <a className="button button-glass button-small" href={`/site/${slug}`} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} />{t.openSite}
        </a>
        <button type="button" className="button button-primary button-small" onClick={() => void save()}
          disabled={status !== "ready"}>
          {status === "saving" ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {status === "saving" ? t.saving : t.save}
        </button>
      </div>
    </div>
    {notice && <p className="editor-saved" role="status">{notice}</p>}
    {fail && <p className="auth-error" role="alert">{fail}</p>}
    {status === "loading" && <p className="seek-meta site-editor-loading"><Loader2 size={15} className="spin" /> {t.title}…</p>}
    <div ref={holder} className="site-editor-canvas" />
  </div>;
}
