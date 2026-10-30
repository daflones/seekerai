"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, X } from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;

export function PayRetryBanner({ attemptId, createdAt, title, sub, cta }: {
  attemptId: string;
  createdAt: string;
  title: string;
  sub: string;
  cta: string;
}) {
  const [show, setShow] = useState(false);
  const key = `payretry-dismissed:${attemptId}`;

  useEffect(() => {
    const fresh = Date.now() - new Date(createdAt).getTime() < DAY_MS;
    const dismissed = typeof window !== "undefined" && localStorage.getItem(key);
    if (fresh && !dismissed) setShow(true);
  }, [attemptId, createdAt, key]);

  function dismiss() {
    try { localStorage.setItem(key, String(Date.now())); } catch { /* sem storage */ }
    setShow(false);
  }

  if (!show) return null;
  return (
    <div className="pay-banner" role="status">
      <BadgeCheck size={18} className="pay-banner-icon" />
      <div className="pay-banner-text">
        <strong>{title}</strong>
        <span>{sub}</span>
      </div>
      <Link href="/app/planos" className="button button-primary button-small" onClick={dismiss}>{cta}</Link>
      <button type="button" className="pay-banner-close" aria-label="×" onClick={dismiss}><X size={15} /></button>
    </div>
  );
}
