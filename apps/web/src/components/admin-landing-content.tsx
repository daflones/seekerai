"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Film, Globe, Loader2, Plus, Save, X } from "lucide-react";
import { LANDING_LANGS, landingContentSchema, type LandingContent, type ShowcaseSite } from "@/lib/landing-content";

const LANGUAGE = { pt: "Português", en: "English", es: "Español", fr: "Français", de: "Deutsch", it: "Italiano" };

export function AdminLandingContent({ initial, sites }: { initial: LandingContent; sites: ShowcaseSite[] }) {
  const [content, setContent] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [slug, setSlug] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = JSON.stringify(content) !== JSON.stringify(saved);

  function selectSite() {
    const value = slug.trim().replace(/^\/site\//, "");
    if (!/^[a-z0-9-]{2,80}$/.test(value) || content.showcase_slugs.includes(value) || content.showcase_slugs.length >= 8) {
      setError("Informe um slug válido, ainda não selecionado. Máximo: 8 sites.");
      return;
    }
    setContent({ ...content, showcase_slugs: [...content.showcase_slugs, value] });
    setConsent(false);
    setSlug("");
    setNotice("");
    setError("");
  }

  function move(index: number, delta: number) {
    const slugs = [...content.showcase_slugs];
    [slugs[index], slugs[index + delta]] = [slugs[index + delta], slugs[index]];
    setContent({ ...content, showcase_slugs: slugs });
    setNotice("");
  }

  async function save() {
    setError(""); setNotice("");
    const parsed = landingContentSchema.safeParse(content);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/landing-content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: parsed.data, showcaseConsent: consent }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? "Não foi possível salvar."); return; }
      setContent(parsed.data); setSaved(parsed.data);
      setNotice("Salvo. A landing já usa esta configuração.");
    } catch { setError("Falha de conexão. Suas alterações foram mantidas; tente salvar novamente."); }
    finally { setBusy(false); }
  }

  return <div className="landing-admin">
    <fieldset disabled={busy}>
      <section className="dash-panel">
        <h2><Film size={18} /> Vídeo de demonstração</h2>
        <p className="dash-hint">O player só aparece quando estiver ativado e houver um vídeo no idioma do visitante. Sem URL, não aparece espaço vazio. Nada toca automaticamente.</p>
        <div className="cred-row">
          <span className="cred-name"><strong>Exibir vídeo na landing</strong></span>
          <button type="button" role="switch" aria-checked={content.video_enabled} aria-label="Exibir vídeo na landing"
            className={`cred-switch${content.video_enabled ? " on" : ""}`}
            onClick={() => { setContent({ ...content, video_enabled: !content.video_enabled }); setNotice(""); }}><span /></button>
        </div>
        <div className="landing-admin-fields">
          {LANDING_LANGS.map((lang) => <label key={lang} className="editor-block-label">
            {LANGUAGE[lang]}
            <input type="url" value={content.video_urls[lang] ?? ""} maxLength={1000} placeholder="https://…"
              onChange={(e) => { setContent({ ...content, video_urls: { ...content.video_urls, [lang]: e.target.value } }); setNotice(""); }} />
          </label>)}
        </div>
        <p className="dash-hint">YouTube, Vimeo público ou arquivo HTTPS .mp4/.webm. Use vídeos com legendas no idioma correspondente.</p>
      </section>
      <section className="dash-panel">
        <h2><Globe size={18} /> Vitrine de sites reais</h2>
        <p className="dash-hint">Selecione até 8 sites publicados e autorizados para divulgação. A ordem abaixo é a ordem da vitrine. Sem seleção, a vitrine mostra automaticamente os sites publicados mais recentes.</p>
        <label className="editor-block-label">Site publicado (slug)
          <input list="landing-sites" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="nome-do-site" maxLength={86} />
          <datalist id="landing-sites">{sites.map((site) => <option key={site.slug} value={site.slug}>{site.name}</option>)}</datalist>
        </label>
        <p className="dash-hint">Sugestões: publicações recentes. Para um site mais antigo, cole o slug que aparece depois de /site/ no link.</p>
        <button type="button" className="button button-glass button-small" onClick={selectSite} disabled={!slug.trim() || content.showcase_slugs.length >= 8}><Plus size={15} /> Adicionar à vitrine</button>
        <ol className="landing-admin-sites">
          {content.showcase_slugs.map((value, index) => <li key={value}>
            <a href={`/site/${value}`} target="_blank" rel="noopener noreferrer">{sites.find((s) => s.slug === value)?.name ?? value}<ExternalLink size={14} /></a>
            <div>
              <button type="button" aria-label={`Mover ${value} para cima`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
              <button type="button" aria-label={`Mover ${value} para baixo`} disabled={index === content.showcase_slugs.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
              <button type="button" aria-label={`Remover ${value} da vitrine`} onClick={() => { setContent({ ...content, showcase_slugs: content.showcase_slugs.filter((s) => s !== value) }); setNotice(""); }}><X size={15} /></button>
            </div>
          </li>)}
        </ol>
        {content.showcase_slugs.length > 0 && <label className="landing-admin-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Confirmo que tenho autorização para divulgar os sites selecionados na landing.
        </label>}
      </section>
    </fieldset>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && !dirty && <p className="editor-saved" role="status"><CheckCircle2 size={15} />{notice}</p>}
    <button type="button" className="button button-primary" onClick={() => void save()}
      disabled={busy || !dirty || (content.showcase_slugs.length > 0 && !consent)}>
      {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />}{busy ? "Salvando…" : "Salvar landing"}
    </button>
  </div>;
}
