// Meta Pixel — helpers client-side. O ID é público (vai no HTML de
// qualquer jeito); pode ser sobrescrito por NEXT_PUBLIC_META_PIXEL_ID.
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "1877448150335048";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export function fbq(...args: unknown[]): void {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq(...args);
  }
}

/** Dispara um evento padrão do pixel (Purchase, InitiateCheckout etc.). */
export function trackMeta(event: string, params?: Record<string, unknown>): void {
  fbq("track", event, params);
}

/** Cookies _fbp/_fbc que o pixel grava — enviados no checkout pra
 *  o evento server-side (CAPI) casar com a sessão do anúncio. */
export function metaCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === "undefined") return {};
  const out: { fbp?: string; fbc?: string } = {};
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === "_fbp") out.fbp = val;
    if (key === "_fbc") out.fbc = val;
  }
  return out;
}
