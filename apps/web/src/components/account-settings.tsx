"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bell, CheckCircle2, Headset, LifeBuoy, Loader2, Mail, Phone,
  Save, ShieldAlert, Trash2, UserRound,
} from "lucide-react";
import type { Messages } from "@/lib/i18n/messages";

type T = Messages["account"];

export function AccountSettings({ nome, email, telefone, t }: {
  nome: string; email: string; telefone: string | null; t: T;
}) {
  const [name, setName] = useState(nome);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState("");

  const dirty = name.trim() !== nome.trim() && name.trim().length >= 2;

  async function saveName() {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setSaved("");
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: name.trim() }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = res ? (await res.json().catch(() => null)) as { error?: string } | null : null;
      setError(data?.error ?? t.errSave);
      return;
    }
    setSaved(t.nameSaved);
  }

  async function deleteAccount() {
    if (deleting) return;
    setDeleting(true);
    setDelError("");
    const res = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setDeleting(false);
      setDelError(t.errDelete);
      return;
    }
    // Limpa o cookie de sessão e manda pro login — a conta já não existe.
    await fetch("/api/auth/logout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }).catch(() => null);
    window.location.replace("/login");
  }

  return <div className="acct-grid">
    <section className="dash-panel acct-panel">
      <h2 className="acct-title"><UserRound size={17} /> {t.dataT}</h2>

      <label className="acct-label">{t.nameLabel}</label>
      <div className="acct-name-row">
        <input value={name} maxLength={60} placeholder={t.namePh}
          onChange={(e) => { setName(e.target.value); setSaved(""); }} />
        <button type="button" className="button button-primary button-small"
          disabled={!dirty || saving} onClick={() => void saveName()}>
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {saving ? t.nameSaving : t.nameSave}
        </button>
      </div>
      {saved && <p role="status" className="notice-ok"><CheckCircle2 size={14} />{saved}</p>}
      {error && <p role="alert" className="auth-error">{error}</p>}

      <div className="acct-row">
        <span className="acct-key"><Mail size={14} /> {t.emailLabel}</span>
        <strong>{email}</strong>
      </div>
      <div className="acct-row">
        <span className="acct-key"><Phone size={14} /> {t.phoneLabel}</span>
        <strong>{telefone || t.phoneEmpty}</strong>
      </div>

      <p className="acct-hint">
        {t.changeHint}{" "}
        <Link href="/app/suporte" className="acct-support-link">
          <Headset size={13} /> {t.changeLink}
        </Link>
      </p>
    </section>

    <section className="dash-panel acct-panel">
      <h2 className="acct-title"><LifeBuoy size={17} /> {t.supportT}</h2>
      <p className="acct-sub">{t.supportP}</p>
      <div className="acct-help">
        <Link href="/app/suporte" className="acct-help-card">
          <span className="acct-help-icon"><Headset size={18} /></span>
          <span><strong>{t.supportCard}</strong><small>{t.supportCardP}</small></span>
        </Link>
        <Link href="/app/suporte" className="acct-help-card">
          <span className="acct-help-icon"><Bell size={18} /></span>
          <span><strong>{t.feedbackCard}</strong><small>{t.feedbackCardP}</small></span>
        </Link>
      </div>
    </section>

    <section className="dash-panel acct-panel acct-danger">
      <h2 className="acct-title acct-danger-title"><ShieldAlert size={17} /> {t.dangerT}</h2>
      <div className="acct-danger-row">
        <span className="acct-danger-icon"><Trash2 size={16} /></span>
        <div className="acct-danger-text">
          <strong>{t.deleteT}</strong>
          <p>{t.deleteP}</p>
        </div>
        {!confirming
          ? <button type="button" className="button acct-del-btn"
              onClick={() => { setConfirming(true); setDelError(""); }}>
              {t.deleteBtn}
            </button>
          : <div className="acct-confirm">
              <strong>{t.confirmT}</strong>
              <p>{t.confirmP}</p>
              <div className="acct-confirm-btns">
                <button type="button" className="button acct-del-btn" disabled={deleting}
                  onClick={() => void deleteAccount()}>
                  {deleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                  {deleting ? t.deleting : t.confirmYes}
                </button>
                <button type="button" className="button button-glass" disabled={deleting}
                  onClick={() => setConfirming(false)}>
                  {t.confirmNo}
                </button>
              </div>
              {delError && <p role="alert" className="auth-error">{delError}</p>}
            </div>}
      </div>
    </section>
  </div>;
}
