"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowUpToLine, Check, Code2, Copy, CopyPlus, ExternalLink, Eye, ImagePlus, Layers, LayoutGrid,
  Loader2, Minus, Monitor, PanelLeft, PanelRight, Plus, Redo2, RotateCcw, Save, ScanLine,
  Search, Send, Settings2, Smartphone, Sparkles, Tablet, Trash2, Undo2, X, Paintbrush,
} from "lucide-react";
import { callAction } from "@/lib/app-client";
import { isCreditsError, OutOfCredits } from "./out-of-credits";
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
type Device = "Desktop" | "Tablet" | "Mobile";

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
// Mídia redimensiona mantendo a proporção — sem isso o GrapesJS grava
// width+height em px e a imagem sai espremida/distida no site salvo.
const MEDIA_TAGS = new Set(["img", "video", "svg", "canvas", "iframe", "picture", "figure"]);

// Edição livre: todo elemento vira arrastável (posicionamento livre,
// segue o mouse), redimensionável pelas 8 alças, copiável e removível.
const FREE_PROPS = {
  draggable: true, resizable: true, copyable: true, removable: true,
  selectable: true, hoverable: true, stylable: true, layerable: true,
  badgable: true, highlightable: true,
  // editable libera o dblclick nativo: texto abre o RTE inline e
  // <img> abre o gerenciador de mídia pra trocar a foto.
  editable: true,
};

const UNLOCKED = new WeakSet<Component>();

function unlockTree(root: Component) {
  if (UNLOCKED.has(root)) return;
  UNLOCKED.add(root);
  const tag = (root.get("tagName") ?? "").toLowerCase();
  if (!SKIP_TAGS.has(tag)) {
    root.set({
      ...FREE_PROPS,
      resizable: MEDIA_TAGS.has(tag) ? { ratioDefault: true } : true,
      droppable: !VOID_TAGS.has(tag),
    });
    // O GrapesJS monta a toolbar padrão na criação do componente
    // (initToolbar); anexo o 📷 aqui — roda antes de qualquer seleção.
    const tb = root.get("toolbar");
    if (Array.isArray(tb) && !tb.some((x) => x?.command === "sk:swap-image")) {
      root.set("toolbar", [...tb, { command: "sk:swap-image", label: ICONS.image }]);
    }
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

// Ícones dos blocos próprios (estilo lucide, traço 1.6).
const ico = (path: string) =>
  `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const ICONS = {
  heading: ico('<path d="M6 4v16M18 4v16M6 12h12"/>'),
  button: ico('<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M9 12h6"/>'),
  whatsapp: ico('<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-5.2A8.5 8.5 0 1 1 21 11.5z"/>'),
  section: ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>'),
  divider: ico('<path d="M3 12h18"/><path d="M8 7h8M8 17h8" opacity=".4"/>'),
  card: ico('<rect x="4" y="3" width="16" height="18" rx="2"/><rect x="7" y="6" width="10" height="6" rx="1"/><path d="M7 15h10M7 18h6"/>'),
  quote: ico('<path d="M7 7h4v4c0 3-2 5-4 5M14 7h4v4c0 3-2 5-4 5"/>'),
  price: ico('<path d="M12 3v18M16 7.5C16 6 14.2 5 12 5s-4 1-4 3 2 2.7 4 3.2 4 1.3 4 3.3-1.8 3-4 3-4-1-4-2.5"/>'),
  cta: ico('<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M7 10h7M7 14h4"/><rect x="15" y="12" width="4" height="3" rx="1"/>'),
  spacer: ico('<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>'),
  image: ico('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3 17l6-5 4 3 4-3 4 3"/>'),
};

const DEVICES: { id: Device; icon: typeof Monitor; key: "desktop" | "tablet" | "mobile" }[] = [
  { id: "Desktop", icon: Monitor, key: "desktop" },
  { id: "Tablet", icon: Tablet, key: "tablet" },
  { id: "Mobile", icon: Smartphone, key: "mobile" },
];

interface Selected { name: string; tag: string; w: number; h: number; isRoot: boolean }

// Editor visual do site do lead/estúdio (GrapesJS) em layout de app:
// blocos/camadas à esquerda, canvas com dispositivo e zoom no centro,
// estilos/configurações à direita e barra de status com o elemento
// selecionado. Salva o HTML final em config.html — o /site serve via
// iframe como tipo "custom".
export function SiteEditor({ slug, nome, lang, t }: { slug: string; nome: string; lang: string; t: T }) {
  const holder = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const selectorsRef = useRef<HTMLDivElement>(null);
  const traitsRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<GjsEditor | null>(null);
  const headRef = useRef("");
  const baseCssRef = useRef("");
  const scriptsRef = useRef("");
  const saveRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "restoring">("loading");
  const [canRestore, setCanRestore] = useState(false);
  const [notice, setNotice] = useState("");
  const [fail, setFail] = useState("");
  const [left, setLeft] = useState<"blocks" | "layers">("blocks");
  const [right, setRight] = useState<"styles" | "settings" | "ai">("styles");
  const [drawer, setDrawer] = useState<"left" | "right" | null>(null);
  const [device, setDevice] = useState<Device>("Desktop");
  const [zoom, setZoom] = useState(100);
  const [outlines, setOutlines] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [sel, setSel] = useState<Selected | null>(null);
  const [code, setCode] = useState<{ html: string; css: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  // Assistente de IA do editor: chat que aplica edições no HTML — com
  // elemento selecionado edita só ele; sem seleção, a página inteira.
  const [aiMsgs, setAiMsgs] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [aiNoCredits, setAiNoCredits] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiImgs, setAiImgs] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const aiFileRef = useRef<HTMLInputElement>(null);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroyed = false;
    let editor: GjsEditor | null = null;
    let canvasCssUrl = "";
    (async () => {
      const [{ default: grapesjs }, { default: blocksBasic }] = await Promise.all([
        import("grapesjs"), import("grapesjs-blocks-basic"),
      ]);
      const res = await fetch(`/api/sites/${slug}/edit`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.doc || destroyed) { setFail(data.error ?? t.loadFail); return; }

      const parsed = new DOMParser().parseFromString(data.doc, "text/html");
      prepareDoc(parsed);
      // O CSS do site sai do documento e entra no canvas como folha
      // externa (blob): o parser interno do GrapesJS não dá conta de
      // folhas grandes e o site precisa renderizar com fidelidade.
      // Edições de estilo saem por getCss() e são salvas depois do base.
      const cssText = [...parsed.querySelectorAll("style")]
        .map((s) => s.textContent ?? "").join("\n");
      baseCssRef.current = cssText;
      parsed.querySelectorAll("style").forEach((s) => s.remove());
      const canvasCss = canvasCssUrl = URL.createObjectURL(new Blob([cssText], { type: "text/css" }));
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

      const num = (property: string, units = ["px", "%", "rem", "em", "vw", "vh"]) =>
        ({ property, type: "number", units, default: "auto", min: 0 });
      const sel = (property: string, ids: string[]) =>
        ({ property, type: "select", default: ids[0], options: ids.map((id) => ({ id, label: id })) });

      editor = grapesjs.init({
        container: holder.current as HTMLElement,
        height: "100%",
        width: "auto",
        storageManager: false,
        // Os painéis padrão saem — a UI do editor é a nossa (React).
        panels: { defaults: [] },
        plugins: [(ed) => blocksBasic(ed, { category: t.catBasic, flexGrid: true })],
        // Posicionamento livre estilo ferramenta de design: o elemento
        // segue o mouse durante o arraste e fica onde foi solto.
        dragMode: "absolute",
        i18n: { locale: lang, messages: { [lang]: LOCALES[lang] ?? {} } },
        blockManager: { appendTo: blocksRef.current as HTMLElement },
        layerManager: { appendTo: layersRef.current as HTMLElement },
        traitManager: { appendTo: traitsRef.current as HTMLElement },
        // componentFirst: o estilo vai pro elemento clicado, não pra todos
        // que dividem a mesma classe — é o que o usuário espera.
        selectorManager: { appendTo: selectorsRef.current as HTMLElement, componentFirst: true },
        styleManager: {
          appendTo: stylesRef.current as HTMLElement,
          sectors: [
            { id: "layout", name: t.sLayout, open: true, properties: [
              "display", "position", "top", "right", "bottom", "left",
              "flex-direction", "flex-wrap", "justify-content", "align-items",
              { ...num("gap", ["px", "rem", "%"]), default: "0" },
              { property: "z-index", type: "number", default: "auto" },
            ] },
            { id: "size", name: t.sSize, open: true, properties: [
              "width", "height", "min-width", "max-width", "min-height", "max-height",
              sel("object-fit", ["fill", "cover", "contain", "none", "scale-down"]),
              "overflow",
            ] },
            { id: "spacing", name: t.sSpacing, open: false, properties: ["margin", "padding"] },
            { id: "type", name: t.sType, open: false, properties: [
              "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
              "color", "text-align", sel("text-transform", ["none", "uppercase", "lowercase", "capitalize"]),
              "text-shadow",
            ] },
            { id: "fill", name: t.sFill, open: false, properties: ["background-color", "background"] },
            { id: "border", name: t.sBorder, open: false, properties: ["border-radius", "border"] },
            { id: "effects", name: t.sEffects, open: false, properties: ["opacity", "box-shadow", "transform", "transition"] },
          ],
        },
        canvas: {
          styles: [...links, canvasCss],
          // Seleção/highlight/toolbar no tema do app (vivem dentro do
          // iframe do canvas — CSS da página não alcança lá).
          frameStyle: `
            .gjs-selected { outline: 2px solid #9667ff !important; outline-offset: -2px; }
            .gjs-hovered { outline: 1px dashed rgba(150,103,255,.65) !important; }
            .gjs-dashed *[data-gjs-highlightable] { outline: 1px dashed rgba(150,103,255,.28) !important; outline-offset: -1px; }
            .gjs-badge, .gjs-badge * { background: #9667ff !important; border-radius: 5px !important; font: 600 11px system-ui, sans-serif !important; }
            .gjs-toolbar { background: #1d1428 !important; border-radius: 9px !important; padding: 2px !important;
              box-shadow: 0 8px 24px -6px rgba(29,20,40,.5) !important; }
            .gjs-toolbar-item { padding: 5px !important; }
            .gjs-resizer-h { border: 2px solid #9667ff !important; background: #fff !important; border-radius: 3px !important; width: 9px !important; height: 9px !important; }
            .gjs-placeholder { background: rgba(150,103,255,.18) !important;
              border: 1.5px dashed #9667ff !important; box-shadow: 0 0 0 2000px rgba(9,7,17,.06) !important; }
            .gjs-rte-toolbar { background: #1d1428 !important; border-radius: 9px !important; border: 0 !important;
              box-shadow: 0 8px 24px -8px rgba(0,0,0,.6) !important; }
            .gjs-rte-action { color: #e9defc !important; border-right: 0 !important; }
            ::-webkit-scrollbar { width: 9px; height: 9px; }
            ::-webkit-scrollbar-thumb { background: #c9bde0; border-radius: 8px; }
          `,
        },
        deviceManager: {
          devices: [
            { id: "Desktop", name: "Desktop", width: "" },
            { id: "Tablet", name: "Tablet", width: "820px", widthMedia: "992px" },
            { id: "Mobile", name: "Mobile", width: "390px", widthMedia: "575px" },
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

      // 📷 na toolbar de qualquer elemento: troca a foto do item
      // selecionado, o fundo, ou adiciona imagem nova (galerias ganham
      // um item clonado pra manter a estrutura do lightbox).
      const tagOf = (c: Component) => (c.get("tagName") ?? "").toLowerCase();
      const firstImg = (c: Component): Component | null => {
        if (tagOf(c) === "img") return c;
        for (const child of c.components()) {
          const hit = firstImg(child);
          if (hit) return hit;
        }
        return null;
      };
      const pickPhoto = (cb: (url: string) => void) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async () => {
          const f = input.files?.[0];
          input.remove();
          if (!f) return;
          const form = new FormData();
          form.append("file", f);
          const d = await fetch("/api/sites/refs", { method: "POST", body: form })
            .then((r) => r.json()).catch(() => ({}));
          if (d.url) cb(d.url as string);
          else setFail(d.error ?? t.imgErr);
        };
        input.click();
      };
      // Troca o src no lugar — limpa srcset pra não sobrar a foto
      // antiga servindo nos breakpoints responsivos.
      const swapSrc = (c: Component, url: string) => {
        if (c.get("type") === "image") c.set({ src: url });
        c.addAttributes({ src: url, srcset: "" });
      };
      const openImagePicker = (ed: GjsEditor, target: Component) => {
        ed.AssetManager.open({
          select: (asset, complete) => {
            const url = (asset as { getSrc?: () => string }).getSrc?.()
              ?? (asset as unknown as { src?: string }).src ?? "";
            if (url) { swapSrc(target, url); setDirty(true); }
            if (complete) ed.AssetManager.close();
          },
          target,
          types: ["image"],
          accept: "image/*",
        });
      };
      editor.Commands.add("sk:swap-image", {
        run(ed, _s, opts) {
          const comp = (opts?.target as Component | undefined) ?? ed.getSelected();
          if (!comp) return;
          if (tagOf(comp) === "img") {
            openImagePicker(ed, comp);
            return;
          }
          // Seção com exatamente uma foto dentro → abre o gerenciador de
          // mídia nela (upload incluso) — fluxo "trocar foto no lugar".
          const inner = firstImg(comp);
          const imgChildren = [...comp.components()].filter((c) => firstImg(c));
          if (inner && imgChildren.length <= 1) {
            openImagePicker(ed, inner);
            return;
          }
          const el = comp.view?.el as HTMLElement | undefined;
          const hasBg = !!el && /url\(/.test(getComputedStyle(el).backgroundImage);
          pickPhoto((url) => {
            if (hasBg) {
              comp.addStyle({ "background-image": `url("${url}")` });
            } else if (imgChildren.length > 1) {
              // Grade/galeria: clona o último item com a foto nova —
              // classes e estrutura continuam iguais pro runtime.
              const clone = comp.append(imgChildren[imgChildren.length - 1].toHTML())[0];
              const cloneImg = clone ? firstImg(clone) : null;
              if (cloneImg) swapSrc(cloneImg, url);
            } else {
              comp.append(`<img src="${url}" alt="" style="max-width:100%;display:block;border-radius:12px;">`);
            }
            ed.DomComponents.getWrapper()?.components().forEach(unlockTree);
            setDirty(true);
          });
        },
      });
      // Todo elemento vira editável: arrasta, redimensiona, copia e remove.
      // O handler cobre tanto o load inicial quanto blocos novos.
      editor.on("component:add", (c: Component) => unlockTree(c));
      editor.setComponents(bodyHtml);
      editor.DomComponents.getWrapper()?.components().forEach(unlockTree);

      // Atalhos: Ctrl+S salva, Ctrl+D duplica o selecionado.
      editor.Keymaps.add("sk:save", "ctrl+s,⌘+s", () => saveRef.current(), { prevent: true });
      editor.Keymaps.add("sk:dup", "ctrl+d,⌘+d", (ed) => ed.runCommand("tlb-clone"), { prevent: true });

      // Blocos prontos além do básico.
      const B = editor.BlockManager;
      const cat = t.catSeeker;
      B.add("sk-heading", {
        label: t.bHeading, category: cat, media: ICONS.heading,
        content: { tagName: "h2", content: t.bHeading, style: { margin: "0 0 12px", "font-size": "36px", "line-height": "1.15" } },
      });
      B.add("sk-button", {
        label: t.bButton, category: cat, media: ICONS.button,
        content: `<a href="#" style="display:inline-block;padding:14px 28px;border-radius:12px;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;">${t.bButton}</a>`,
      });
      B.add("sk-whatsapp", {
        label: t.bWhatsapp, category: cat, media: ICONS.whatsapp,
        content: `<a href="https://wa.me/" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;border-radius:12px;background:#22c55e;color:#fff;text-decoration:none;font-weight:700;">${t.bWhatsapp}</a>`,
      });
      B.add("sk-section", {
        label: t.bSection, category: cat, media: ICONS.section,
        content: `<section style="padding:72px 24px;max-width:1100px;margin:0 auto;"><h2 style="margin:0 0 12px;font-size:36px;">${t.bSection}</h2><p style="margin:0;max-width:60ch;line-height:1.7;opacity:.8;">${t.bSection}</p></section>`,
      });
      B.add("sk-card", {
        label: t.bCard, category: cat, media: ICONS.card,
        content: `<div style="padding:28px;border-radius:18px;background:#fff;box-shadow:0 10px 30px rgba(20,10,40,.08);max-width:360px;"><h3 style="margin:0 0 8px;font-size:22px;">${t.bCard}</h3><p style="margin:0;line-height:1.6;opacity:.75;">${t.bSection}</p></div>`,
      });
      B.add("sk-quote", {
        label: t.bQuote, category: cat, media: ICONS.quote,
        content: `<blockquote style="margin:0;padding:28px 32px;border-left:4px solid #7c5cff;background:rgba(124,92,255,.06);border-radius:0 16px 16px 0;"><p style="margin:0 0 12px;font-size:20px;line-height:1.5;">“${t.bQuote}”</p><cite style="font-style:normal;font-weight:600;opacity:.7;">— Cliente</cite></blockquote>`,
      });
      B.add("sk-price", {
        label: t.bPrice, category: cat, media: ICONS.price,
        content: `<div style="padding:32px;border-radius:20px;border:1px solid rgba(0,0,0,.1);max-width:320px;text-align:center;"><p style="margin:0;font-weight:600;opacity:.7;">${t.bPrice}</p><p style="margin:10px 0 20px;font-size:44px;font-weight:700;">R$ 99</p><a href="#" style="display:inline-block;padding:12px 26px;border-radius:12px;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;">${t.bButton}</a></div>`,
      });
      B.add("sk-cta", {
        label: t.bCta, category: cat, media: ICONS.cta,
        content: `<section style="margin:40px auto;padding:56px 32px;max-width:1100px;border-radius:24px;background:linear-gradient(125deg,#efe6ff,#bfa1f2);text-align:center;color:#251338;"><h2 style="margin:0 0 12px;font-size:38px;">${t.bCta}</h2><p style="margin:0 0 24px;opacity:.8;">${t.bSection}</p><a href="#" style="display:inline-block;padding:14px 30px;border-radius:12px;background:#1d1428;color:#fff;text-decoration:none;font-weight:600;">${t.bButton}</a></section>`,
      });
      B.add("sk-divider", {
        label: t.bDivider, category: cat, media: ICONS.divider,
        content: { tagName: "hr", style: { border: "0", "border-top": "1px solid rgba(0,0,0,.12)", margin: "32px 0" } },
      });
      B.add("sk-spacer", {
        label: t.bSpacer, category: cat, media: ICONS.spacer,
        content: { tagName: "div", style: { height: "48px" } },
      });

      // A locale pt do GrapesJS vem sem rótulos de bloco — traduz os
      // básicos do plugin com as nossas mensagens.
      const basicLabels: [string, string][] = [
        ["column1", t.blCol1], ["column2", t.blCol2], ["column3", t.blCol3],
        ["column3-7", t.blCol37], ["text", t.blText], ["link", t.blLink],
        ["image", t.blImage], ["video", t.blVideo], ["map", t.blMap],
      ];
      for (const [id, label] of basicLabels) B.get(id)?.set("label", label);

      // Estado da UI acompanha o editor: seleção + medidas, histórico e
      // alterações não salvas.
      const refresh = () => {
        const ed = editor;
        if (!ed) return;
        const c = ed.getSelected();
        const el = c?.getEl();
        const rect = el?.getBoundingClientRect();
        setSel(c ? {
          name: c.getName(), tag: (c.get("tagName") ?? "").toLowerCase(),
          w: Math.round(rect?.width ?? 0), h: Math.round(rect?.height ?? 0),
          isRoot: c.parent() === ed.DomComponents.getWrapper() || !c.parent(),
        } : null);
        setHistory({ undo: ed.UndoManager.hasUndo(), redo: ed.UndoManager.hasRedo() });
        setDirty(ed.getDirtyCount() > 0);
      };
      editor.on("component:toggled component:update component:styleUpdate component:resize update undo redo", refresh);
      editor.on("component:selected", () => { setRight("styles"); refresh(); });

      editor.UndoManager.clear();
      editor.clearDirtyCount();
      editorRef.current = editor;
      setCanRestore(Boolean(data.canRestore));
      setStatus("ready");
      refresh();
    })().catch(() => setFail(t.loadFail));
    return () => { destroyed = true; editor?.destroy(); editorRef.current = null; if (canvasCssUrl) URL.revokeObjectURL(canvasCssUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Avisa antes de sair com edições pendentes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Busca de blocos: re-renderiza só os que batem com o termo.
  useEffect(() => {
    const B = editorRef.current?.BlockManager;
    if (!B) return;
    const q = query.trim().toLowerCase();
    B.render(q ? B.getAll().filter((b: { getLabel: () => unknown }) => String(b.getLabel()).toLowerCase().includes(q)) : undefined);
  }, [query, status]);

  const buildDoc = () => {
    const editor = editorRef.current;
    if (!editor) return "";
    return `<!doctype html><html lang="pt"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${nome.replace(/</g, "")}</title>${headRef.current}` +
      `<style>${baseCssRef.current}</style><style>${editor.getCss()}</style>` +
      `</head><body>${editor.getHtml()}${scriptsRef.current}</body></html>`;
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
    if (res.ok) {
      editorRef.current?.clearDirtyCount();
      setDirty(false);
      setNotice(t.saved); setCanRestore(Boolean(data.canRestore ?? true)); setStatus("ready");
      window.setTimeout(() => setNotice(""), 2500);
    } else { setFail(data.error ?? t.saveFail); setStatus("ready"); }
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
  const ready = status === "ready";
  const pickDevice = (d: Device) => { gjs()?.setDevice(d); setDevice(d); };
  const applyZoom = (z: number) => {
    const v = Math.min(150, Math.max(25, z));
    gjs()?.Canvas.setZoom(v);
    setZoom(v);
  };
  const toggleOutlines = () => {
    const ed = gjs();
    if (!ed) return;
    if (outlines) ed.stopCommand("core:component-outline"); else ed.runCommand("core:component-outline");
    setOutlines(!outlines);
  };
  const openCode = () => {
    const ed = gjs();
    if (ed) setCode({ html: ed.getHtml(), css: ed.getCss() ?? "" });
  };
  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(`${code.html}\n<style>\n${code.css}\n</style>`).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const selectParent = () => {
    const ed = gjs();
    const p = ed?.getSelected()?.parent();
    if (ed && p && p !== ed.DomComponents.getWrapper()) ed.select(p);
  };

  // Chat da IA: scroll sempre no fim.
  useEffect(() => {
    aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight });
  }, [aiMsgs, aiBusy]);

  const uploadAiImg = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length || aiImgs.length >= 5) return;
    for (const f of list.slice(0, 5 - aiImgs.length)) {
      const form = new FormData();
      form.append("file", f);
      const d = await fetch("/api/sites/refs", { method: "POST", body: form })
        .then((r) => r.json()).catch(() => ({}));
      if (d.url) setAiImgs((cur) => [...cur.slice(0, 4), d.url as string]);
    }
    if (aiFileRef.current) aiFileRef.current.value = "";
  };

  // Insere a imagem gerada: troca o src se o selecionado é <img>, senão
  // anexa uma figura dentro do selecionado (ou no fim da página).
  const insertAiImage = (ed: GjsEditor, url: string) => {
    const comp = ed.getSelected();
    const tag = (comp?.get("tagName") ?? "").toLowerCase();
    if (comp && tag === "img") { comp.addAttributes({ src: url }); return; }
    const figure = `<figure style="margin:24px auto;max-width:720px;"><img src="${url}" alt="" style="width:100%;border-radius:14px;display:block;"></figure>`;
    if (comp && comp.get("droppable") !== false) comp.append(figure);
    else ed.DomComponents.getWrapper()?.append(figure);
  };

  const sendAi = async () => {
    const ed = editorRef.current;
    const instr = aiInput.trim();
    if (!ed || !instr || aiBusy) return;
    const comp = ed.getSelected();
    const targetHtml = comp ? comp.toHTML() : ed.getHtml();
    if (!targetHtml || targetHtml.length > 240_000) {
      setAiMsgs((cur) => [...cur, { role: "ai", text: t.aiTooBig }]);
      return;
    }
    // Página inteira grande: a IA precisaria devolver o HTML todo de volta,
    // o que estoura o tempo/limite de saída — pede pra selecionar a seção.
    if (!comp && targetHtml.length > 60_000) {
      setAiMsgs((cur) => [...cur, { role: "ai", text: t.aiPickTarget }]);
      return;
    }
    setAiBusy(true);
    setAiNoCredits(false);
    setAiMsgs((cur) => [...cur, { role: "user", text: instr }]);
    setAiInput("");
    const reply = (text: string) => setAiMsgs((cur) => [...cur, { role: "ai", text }]);
    const res = await callAction<{ conteudo?: string }>("ai-generate", {
      action: "editor_assist",
      serviceSlug: "_editor",
      businessRef: `site:${slug}`,
      requestRef: crypto.randomUUID(),
      lang,
      prompt: instr,
      context: {
        html: targetHtml,
        alvo: comp ? `${comp.getName()} <${(comp.get("tagName") ?? "").toLowerCase()}>` : null,
        nome,
        imagens: aiImgs,
      },
    });
    if (!res.ok && isCreditsError(res.error)) { setAiNoCredits(true); setAiBusy(false); return; }
    const raw = res.ok ? res.data.conteudo : null;
    const cleaned = (raw ?? "").replace(/```(?:json)?|```/g, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    let dec: { reply?: string; html?: string; imagePrompt?: string } | null = null;
    try { if (s >= 0 && e > s) dec = JSON.parse(cleaned.slice(s, e + 1)); } catch { /* malformado */ }
    if (!dec) { reply(t.aiFail); setAiBusy(false); return; }

    // Pedido de imagem nova: a IA pede e o app gera pela ação normal (2cr).
    if (dec.imagePrompt && !dec.html) {
      const img = await callAction<{ imagens?: string[] }>("ai-generate", {
        action: "generate_image",
        serviceSlug: "_editor",
        businessRef: `site:${slug}`,
        requestRef: crypto.randomUUID(),
        lang,
        prompt: dec.imagePrompt,
        context: { nome },
      });
      if (!img.ok && isCreditsError(img.error)) {
        setAiNoCredits(true); setAiImgs([]); setAiBusy(false); return;
      }
      const url = img.ok ? img.data.imagens?.[0] : null;
      if (url) {
        insertAiImage(ed, url);
        ed.DomComponents.getWrapper()?.components().forEach(unlockTree);
        setDirty(true);
        reply(dec.reply ? `${dec.reply} ${t.aiImgDone}` : t.aiImgDone);
      } else {
        reply(dec.reply ?? t.aiFail);
      }
      setAiImgs([]);
      setAiBusy(false);
      return;
    }

    if (dec.html) {
      try {
        if (comp) comp.replaceWith(dec.html);
        else ed.setComponents(dec.html);
        ed.DomComponents.getWrapper()?.components().forEach(unlockTree);
        setDirty(true);
      } catch { /* HTML inválido — só avisa */ }
      reply(dec.reply ? `${dec.reply} ${t.aiApplied}` : t.aiApplied);
    } else {
      reply(dec.reply ?? t.aiFail);
    }
    setAiImgs([]);
    setAiBusy(false);
  };

  return <div className={`site-editor${drawer ? ` drawer-${drawer}` : ""}`}>
    <header className="se-top">
      <div className="se-top-left">
        <Link href="/app/criacoes" className="se-icon-btn" aria-label={t.back} title={t.back}><ArrowLeft size={17} /></Link>
        <div className="se-title">
          <small>{t.title}</small>
          <strong>{nome}</strong>
        </div>
        <span className={`se-save-state${dirty ? " is-dirty" : ""}`}>
          <i />{dirty ? t.unsaved : t.allSaved}
        </span>
      </div>

      <div className="se-top-center">
        <div className="se-seg" role="group" aria-label="Device">
          {DEVICES.map(({ id, icon: Icon, key }) => (
            <button key={id} type="button" className={device === id ? "on" : ""} title={t[key]}
              aria-pressed={device === id} onClick={() => pickDevice(id)} disabled={!ready}>
              <Icon size={16} />
            </button>
          ))}
        </div>
        <div className="se-seg se-zoom">
          <button type="button" title={t.zoomOut} onClick={() => applyZoom(zoom - 10)} disabled={!ready}><Minus size={15} /></button>
          <button type="button" title={t.zoomFit} className="se-zoom-value" onClick={() => applyZoom(100)} disabled={!ready}>{zoom}%</button>
          <button type="button" title={t.zoomIn} onClick={() => applyZoom(zoom + 10)} disabled={!ready}><Plus size={15} /></button>
        </div>
        <div className="se-seg">
          <button type="button" title={t.undo} onClick={() => gjs()?.UndoManager.undo()} disabled={!ready || !history.undo}><Undo2 size={16} /></button>
          <button type="button" title={t.redo} onClick={() => gjs()?.UndoManager.redo()} disabled={!ready || !history.redo}><Redo2 size={16} /></button>
        </div>
        <div className="se-seg">
          <button type="button" title={t.outlines} className={outlines ? "on" : ""} aria-pressed={outlines}
            onClick={toggleOutlines} disabled={!ready}><ScanLine size={16} /></button>
          <button type="button" title={t.code} onClick={openCode} disabled={!ready}><Code2 size={16} /></button>
          <button type="button" title={t.preview} onClick={() => gjs()?.runCommand("core:preview")} disabled={!ready}><Eye size={16} /></button>
        </div>
      </div>

      <div className="se-top-right">
        {canRestore && (
          <button type="button" className="se-ghost-btn" onClick={() => void restore()} disabled={!ready} title={t.restore}>
            {status === "restoring" ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />}
            <span>{t.restore}</span>
          </button>
        )}
        <a className="se-ghost-btn" href={`/site/${slug}`} target="_blank" rel="noopener noreferrer" title={t.openSite}>
          <ExternalLink size={15} /><span>{t.openSite}</span>
        </a>
        <button type="button" className="se-save" onClick={() => void save()} disabled={!ready}>
          {status === "saving" ? <Loader2 size={15} className="spin" /> : notice ? <Check size={15} /> : <Save size={15} />}
          {status === "saving" ? t.saving : t.save}
        </button>
      </div>
    </header>

    <div className="se-body">
      <aside className="se-panel se-left" aria-label={t.blocks}>
        <div className="se-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={left === "blocks"} className={left === "blocks" ? "on" : ""}
            onClick={() => setLeft("blocks")}><LayoutGrid size={14} />{t.blocks}</button>
          <button type="button" role="tab" aria-selected={left === "layers"} className={left === "layers" ? "on" : ""}
            onClick={() => setLeft("layers")}><Layers size={14} />{t.layers}</button>
        </div>
        <div className="se-panel-scroll" hidden={left !== "blocks"}>
          <label className="se-search">
            <Search size={14} />
            <input type="search" value={query} placeholder={t.searchBlocks} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div ref={blocksRef} className="se-blocks" />
        </div>
        <div className="se-panel-scroll" hidden={left !== "layers"}><div ref={layersRef} /></div>
      </aside>

      <main className="se-stage">
        {status === "loading" && !fail && <div className="se-loading"><Loader2 size={22} className="spin" /><span>{t.title}…</span></div>}
        {(fail || notice) && <div className={`se-toast${fail ? " is-error" : ""}`} role={fail ? "alert" : "status"}>
          {fail || notice}
          {fail && <button type="button" aria-label={t.close} onClick={() => setFail("")}><X size={14} /></button>}
        </div>}
        <div ref={holder} className="site-editor-canvas" />
      </main>

      <aside className="se-panel se-right" aria-label={t.styles}>
        <div className="se-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={right === "styles"} className={right === "styles" ? "on" : ""}
            onClick={() => setRight("styles")}><Paintbrush size={14} />{t.styles}</button>
          <button type="button" role="tab" aria-selected={right === "settings"} className={right === "settings" ? "on" : ""}
            onClick={() => setRight("settings")}><Settings2 size={14} />{t.settings}</button>
          <button type="button" role="tab" aria-selected={right === "ai"} className={right === "ai" ? "on" : ""}
            onClick={() => setRight("ai")}><Sparkles size={14} />{t.ai}</button>
        </div>
        {!sel && right !== "ai" && <div className="se-empty"><Paintbrush size={22} /><p>{t.selectHint}</p></div>}
        <div className="se-panel-scroll" hidden={right !== "styles" || !sel}>
          <div ref={selectorsRef} className="se-selectors" />
          <div ref={stylesRef} />
        </div>
        <div className="se-panel-scroll" hidden={right !== "settings" || !sel}><div ref={traitsRef} /></div>
        <div className="se-panel-scroll se-ai" hidden={right !== "ai"}>
          <p className="se-ai-hint">{t.aiHint}</p>
          <p className="se-ai-hint">{t.aiRegenTip}</p>
          <div className="se-ai-target"><Sparkles size={12} />{t.aiSel}<strong>{sel ? sel.name : t.aiPage}</strong></div>
          <div className="se-ai-msgs" ref={aiScrollRef}>
            {!aiMsgs.length && !aiBusy && <div className="se-ai-empty"><Sparkles size={18} /><span>{t.aiPh}</span></div>}
            {aiMsgs.map((m, i) => <div key={i} className={`se-ai-msg is-${m.role}`}>{m.text}</div>)}
            {aiBusy && <div className="se-ai-msg is-ai"><Loader2 size={13} className="spin" /></div>}
          </div>
          {aiNoCredits && <OutOfCredits lang={lang} />}
          {aiImgs.length > 0 && <div className="se-ai-imgs">
            {aiImgs.map((u) => <span key={u} className="se-ai-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" />
              <button type="button" aria-label="×" onClick={() => setAiImgs((cur) => cur.filter((x) => x !== u))}>×</button>
            </span>)}
          </div>}
          <div className="se-ai-input">
            <button type="button" className="se-ai-icon" title={t.aiAttach}
              disabled={aiBusy || aiImgs.length >= 5} onClick={() => aiFileRef.current?.click()}>
              <ImagePlus size={16} />
            </button>
            <textarea value={aiInput} placeholder={t.aiPh} rows={2} maxLength={2000}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendAi(); } }} />
            <button type="button" className="se-ai-send" title={t.aiSend}
              disabled={aiBusy || !aiInput.trim()} onClick={() => void sendAi()}>
              {aiBusy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
            </button>
          </div>
          <input ref={aiFileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { if (e.target.files?.length) void uploadAiImg(e.target.files); }} />
        </div>
      </aside>
    </div>

    <footer className="se-status">
      <button type="button" className="se-drawer-btn" onClick={() => setDrawer(drawer === "left" ? null : "left")} aria-label={t.blocks}><PanelLeft size={15} /></button>
      {sel ? <>
        <span className="se-sel-name"><span className="se-tag">{sel.tag || "div"}</span>{sel.name}</span>
        <span className="se-sel-size">{sel.w} × {sel.h} px</span>
        <div className="se-sel-actions">
          <button type="button" onClick={selectParent} disabled={sel.isRoot} title={t.parent}><ArrowUpToLine size={14} /></button>
          <button type="button" onClick={() => gjs()?.runCommand("tlb-clone")} title={`${t.duplicate} (Ctrl+D)`}><CopyPlus size={14} /></button>
          <button type="button" className="danger" onClick={() => gjs()?.runCommand("tlb-delete")} title={t.remove}><Trash2 size={14} /></button>
        </div>
      </> : <span className="se-hint">{t.hint}</span>}
      <button type="button" className="se-drawer-btn" onClick={() => setDrawer(drawer === "right" ? null : "right")} aria-label={t.styles}><PanelRight size={15} /></button>
    </footer>

    {code && <div className="se-modal" role="dialog" aria-modal="true" aria-label={t.codeTitle} onClick={() => setCode(null)}>
      <div className="se-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-head">
          <strong><Code2 size={16} />{t.codeTitle}</strong>
          <button type="button" className="se-ghost-btn" onClick={() => void copyCode()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t.copied : t.copy}
          </button>
          <button type="button" className="se-icon-btn" aria-label={t.close} onClick={() => setCode(null)}><X size={16} /></button>
        </div>
        <div className="se-code">
          <pre><code>{code.html}</code></pre>
          <pre><code>{code.css}</code></pre>
        </div>
      </div>
    </div>}
  </div>;
}
