"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ExternalLink, Eye, Loader2, Redo2, RotateCcw, Save, Undo2,
} from "lucide-react";
import type grapesjs from "grapesjs";
import type { Component } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import gjsLocalePt from "grapesjs/locale/pt";
import gjsLocaleEn from "grapesjs/locale/en";
import gjsLocaleEs from "grapesjs/locale/es";
import gjsLocaleFr from "grapesjs/locale/fr";
import gjsLocaleDe from "grapesjs/locale/de";
import gjsLocaleIt from "grapesjs/locale/it";
import type { Messages } from "@/lib/i18n/messages";

type GjsEditor = ReturnType<typeof grapesjs.init>;
type T = Messages["siteEdit"];

const LOCALES: Record<string, Record<string, unknown>> = {
  pt: gjsLocalePt, en: gjsLocaleEn, es: gjsLocaleEs,
  fr: gjsLocaleFr, de: gjsLocaleDe, it: gjsLocaleIt,
};

// Tags sem conteúdo editável — não ganham drag/resize no canvas.
const SKIP_TAGS = new Set([
  "script", "style", "title", "meta", "link", "head",
  "noscript", "template", "option", "optgroup",
]);
// Elementos "void" não aceitam filhos — sem droppable.
const VOID_TAGS = new Set([
  "img", "input", "br", "hr", "source", "track", "wbr",
  "area", "base", "col", "embed", "video", "audio", "iframe", "canvas",
]);

// Edição livre: todo elemento vira arrastável (posicionamento livre,
// segue o mouse), redimensionável pelas 8 alças, copiável e removível.
const FREE_PROPS = {
  draggable: true, resizable: true, copyable: true, removable: true,
  selectable: true, hoverable: true, stylable: true, layerable: true,
  badgable: true, highlightable: true,
};

const UNLOCKED = new WeakSet<Component>();

function unlockTree(root: Component) {
  if (UNLOCKED.has(root)) return;
  UNLOCKED.add(root);
  const tag = (root.get("tagName") ?? "").toLowerCase();
  if (!SKIP_TAGS.has(tag)) {
    root.set({ ...FREE_PROPS, droppable: !VOID_TAGS.has(tag) });
  }
  if (tag !== "svg") root.components().forEach(unlockTree);
}

// Deixa o documento pronto pra edição: remove lixo do Next (noscript/
// template poluem a árvore de camadas), neutraliza os estados iniciais
// do Framer Motion que ficam congelados sem o JS (opacity:0 +
// translate/blur), liga controles nativos dos vídeos e destrava
// imagens lazy pra aparecerem no canvas.
function prepareDoc(parsed: Document) {
  parsed.querySelectorAll("noscript,template").forEach((n) => n.remove());
  parsed.querySelectorAll('img[loading="lazy"]').forEach((i) => i.removeAttribute("loading"));
  parsed.querySelectorAll("video:not([controls])").forEach((v) => {
    v.setAttribute("controls", "");
    v.setAttribute("preload", "metadata");
  });
  parsed.querySelectorAll('button[class*="video-play"]').forEach((b) => b.remove());
  parsed.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const s = el.style;
    if (parseFloat(s.opacity || "1") !== 0) return;
    s.removeProperty("opacity");
    const tr = (s.transform || "")
      .replace(/translate3d?\([^)]*\)/gi, "")
      .replace(/translate[XYZ]\([^)]*\)/gi, "").trim();
    const fl = (s.filter || "").replace(/blur\([^)]*\)/gi, "").trim();
    if (s.transform) { if (tr) s.setProperty("transform", tr); else s.removeProperty("transform"); }
    if (s.filter) { if (fl) s.setProperty("filter", fl); else s.removeProperty("filter"); }
  });
}

// Editor visual do site do lead/estúdio (GrapesJS): edita texto inline,
// troca imagens, arrasta em posição livre, redimensiona pelas alças,
// duplica/remove elementos e adiciona blocos novos. Salva o HTML final
// em config.html — o /site serve via iframe como tipo "custom".
export function SiteEditor({ slug, nome, lang, t }: { slug: string; nome: string; lang: string; t: T }) {
  const holder = useRef<HTMLDivElement>(null);
  const editorRef = useRef<GjsEditor | null>(null);
  const headRef = useRef("");
  const scriptsRef = useRef("");
  const saveRef = useRef<() => void>(() => {});
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
      prepareDoc(parsed);
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
        // Posicionamento livre estilo ferramenta de design: o elemento
        // segue o mouse durante o arraste e fica onde foi solto.
        dragMode: "absolute",
        i18n: { locale: lang, messages: { [lang]: LOCALES[lang] ?? {} } },
        canvas: {
          styles: links,
          // Seleção/highlight/toolbar no tema do app (vivem dentro do
          // iframe do canvas — CSS da página não alcança lá).
          frameStyle: `
            .gjs-selected { outline: 2px solid #9667ff !important; outline-offset: -2px; }
            .gjs-hovered { outline: 1px dashed rgba(150,103,255,.65) !important; }
            .gjs-badge, .gjs-badge * { background: #9667ff !important; }
            .gjs-toolbar { background: linear-gradient(135deg,#a879ff,#7b3ff2) !important;
              border-radius: 8px !important; box-shadow: 0 8px 24px -6px rgba(150,103,255,.55) !important; }
            .gjs-resizer-h { border-color: #9667ff !important; background: #9667ff !important; }
            .gjs-placeholder { background: rgba(150,103,255,.18) !important;
              border: 1.5px dashed #9667ff !important; box-shadow: 0 0 0 2000px rgba(9,7,17,.06) !important; }
            .gjs-rte-toolbar { background: #191526 !important; border-radius: 8px !important;
              box-shadow: 0 8px 24px -8px rgba(0,0,0,.6) !important; }
            .gjs-rte-action { color: #d8bcec !important; }
            ::-webkit-scrollbar { width: 9px; height: 9px; }
            ::-webkit-scrollbar-thumb { background: #2c2440; border-radius: 8px; }
          `,
        },
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

      // Todo elemento vira editável: arrasta, redimensiona, copia e remove.
      // O handler cobre tanto o load inicial quanto blocos novos.
      editor.on("component:add", (c: Component) => unlockTree(c));
      editor.setComponents(bodyHtml);
      if (cssText) editor.setStyle(cssText);
      editor.DomComponents.getWrapper()?.components().forEach(unlockTree);

      // Ctrl+S salva direto do editor.
      editor.Keymaps.add("sk:save", "ctrl+s,⌘+s", () => saveRef.current(), { prevent: true });

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
  saveRef.current = () => void save();

  const restore = async () => {
    if (status === "restoring" || !window.confirm(t.restoreAsk)) return;
    setStatus("restoring");
    setNotice(""); setFail("");
    const res = await fetch(`/api/sites/${slug}/edit`, { method: "DELETE" });
    if (res.ok) { window.location.reload(); return; }
    setFail(t.saveFail);
    setStatus("ready");
  };

  const gjs = () => editorRef.current;

  return <div className="site-editor">
    <div className="site-editor-bar">
      <Link href="/app" className="text-link"><ArrowLeft size={14} />{t.back}</Link>
      <span className="site-editor-title">{t.title} — <strong>{nome}</strong></span>
      <span className="site-editor-hint">{t.hint}</span>
      <div className="site-editor-actions">
        <button type="button" className="button button-glass button-icon" title={t.undo}
          onClick={() => gjs()?.UndoManager.undo()} disabled={status !== "ready"}>
          <Undo2 size={15} />
        </button>
        <button type="button" className="button button-glass button-icon" title={t.redo}
          onClick={() => gjs()?.UndoManager.redo()} disabled={status !== "ready"}>
          <Redo2 size={15} />
        </button>
        <button type="button" className="button button-glass button-icon" title={t.preview}
          onClick={() => gjs()?.runCommand("core:preview")} disabled={status !== "ready"}>
          <Eye size={15} />
        </button>
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
