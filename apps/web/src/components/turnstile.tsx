"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export function Turnstile({ siteKey, action, epoch, onToken }: {
  siteKey: string; action: string; epoch: number; onToken: (token: string | null) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { callback.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!ready || !holder.current || !window.turnstile) return;
    setError(false);
    callback.current(null);
    const api = window.turnstile;
    let id: string | undefined;
    try {
      id = api.render(holder.current, {
        sitekey: siteKey, action, theme: "dark",
        size: holder.current.clientWidth < 300 ? "compact" : "flexible",
        callback: (token: string) => { setError(false); callback.current(token); },
        "expired-callback": () => callback.current(null),
        "timeout-callback": () => callback.current(null),
        "error-callback": () => { setError(true); callback.current(null); return true; },
      });
    } catch { setError(true); }
    return () => {
      callback.current(null);
      if (id !== undefined) api.remove(id);
    };
  }, [ready, siteKey, action, epoch]);

  return <div className="turnstile-container">
    <Script id="cloudflare-turnstile" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setError(true)} />
    <div ref={holder} aria-label="Verificação de segurança Cloudflare" />
    {error && <p role="alert" className="captcha-error">Não foi possível verificar. Confira sua conexão, bloqueadores e se este domínio está permitido no Turnstile.</p>}
  </div>;
}
