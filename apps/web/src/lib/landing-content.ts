import { z } from "zod";
import type { Lang } from "@/lib/i18n/shared";

export const LANDING_LANGS: Lang[] = ["pt", "en", "es", "fr", "de", "it"];
export type VideoSource = { kind: "embed" | "file"; src: string };
export type ShowcaseSite = { slug: string; name: string };

export function videoSource(value: string): VideoSource | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !host.includes(".") || /(^|\.)localhost$|\.local$|\.internal$|^[\d.]+$|:|\[/.test(host)) return null;
    if (["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be" ? url.pathname.slice(1)
        : url.pathname === "/watch" ? url.searchParams.get("v")
        : /^\/(?:embed|shorts)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
      return id && /^[\w-]{11}$/.test(id)
        ? { kind: "embed", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
      const id = /^\/(?:video\/)?(\d{6,12})\/?$/.exec(url.pathname)?.[1];
      return id ? { kind: "embed", src: `https://player.vimeo.com/video/${id}` } : null;
    }
    return /\.(mp4|webm)$/i.test(url.pathname) ? { kind: "file", src: url.href } : null;
  } catch { return null; }
}

const videoUrl = z.string().trim().max(1000).refine((s) => !s || videoSource(s) !== null, "Use YouTube, Vimeo ou um arquivo HTTPS .mp4/.webm.");
export const landingContentSchema = z.object({
  video_enabled: z.boolean(),
  video_urls: z.object({ pt: videoUrl.optional(), en: videoUrl.optional(), es: videoUrl.optional(), fr: videoUrl.optional(), de: videoUrl.optional(), it: videoUrl.optional() }).strict(),
  showcase_slugs: z.array(z.string().regex(/^[a-z0-9-]{2,80}$/)).max(8)
    .refine((slugs) => new Set(slugs).size === slugs.length, "Não repita um site."),
}).strict().refine((v) => !v.video_enabled || Object.values(v.video_urls).some(Boolean), {
  message: "Adicione pelo menos um vídeo antes de ativar.", path: ["video_urls"],
});
export type LandingContent = z.infer<typeof landingContentSchema>;

export function parseLandingContent(value: unknown): LandingContent {
  const parsed = landingContentSchema.safeParse(value);
  return parsed.success ? parsed.data : { video_enabled: false, video_urls: {}, showcase_slugs: [] };
}
