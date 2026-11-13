// Instagram via ScrapeCreators — fonte barata primária com fallback de
// key (duas contas) e cache por handle no ig_cache (TTL 7 dias).
// O Apify continua como fallback de última instância nos callers.

import { isRecord, serviceClient } from "./common.ts";
import { getSecret } from "./secrets.ts";

const SC = "https://api.scrapecreators.com";
const CACHE_MS = 7 * 24 * 3600 * 1000;

export interface IgProfileData {
  seguidores: number | null;
  posts: number | null;
  curtidas: number | null;
  foto: string | null;
  bio: string | null;
  verificado: boolean;
  /** wa.me extraído do link na bio — telefone real do dono. */
  whatsapp?: string | null;
  categoria?: string | null;
}

export interface IgMediaData {
  images: string[];
  videos: { src: string; titulo: string }[];
  captions: string[];
}

function asStr(v: unknown, max = 600): string | null {
  return typeof v === "string" && v.trim() ? v.slice(0, max) : null;
}
function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function scFetch(path: string): Promise<Record<string, unknown> | null> {
  const keys = [
    await getSecret("SCRAPECREATORS_API_KEY"),
    await getSecret("SCRAPECREATORS_API_KEY_2"),
  ].filter((k): k is string => Boolean(k));
  for (const key of keys) {
    const res = await fetch(`${SC}${path}`, {
      headers: { "x-api-key": key, accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (res?.ok) return await res.json().catch(() => null);
    // 402 = sem crédito → tenta a próxima key; demais erros também
    console.error("[ig-sc] falhou:", path.slice(0, 60), res?.status ?? "net");
  }
  return null;
}

/** Perfil completo: bio, seguidores, foto, curtidas médias, wa.me da bio. */
export async function scProfile(handle: string): Promise<IgProfileData | null> {
  const d = await scFetch(`/v1/instagram/profile?handle=${encodeURIComponent(handle)}`);
  const data = isRecord(d?.data) ? d.data : null;
  const u = isRecord(data?.user) ? data.user : null;
  if (!u) return null;

  const timeline = isRecord(u.edge_owner_to_timeline_media) ? u.edge_owner_to_timeline_media : null;
  const edges = Array.isArray(timeline?.edges) ? timeline.edges : [];
  const likes = edges
    .map((e) => {
      const n = isRecord(e) && isRecord(e.node) ? e.node : null;
      if (!n) return null;
      const like = isRecord(n.edge_media_preview_like) ? n.edge_media_preview_like.count
        : isRecord(n.edge_liked_by) ? n.edge_liked_by.count
        : isRecord(n.edge_media_preview) ? n.edge_media_preview.count : null;
      return asNum(like);
    })
    .filter((n): n is number => n !== null);

  // wa.me nos links da bio — telefone real do estabelecimento.
  let whatsapp: string | null = null;
  for (const l of Array.isArray(u.bio_links) ? u.bio_links : []) {
    if (!isRecord(l)) continue;
    const url = asStr(l.url ?? l.lynx_url, 1200);
    const m = url?.match(/wa\.me\/(\d{10,15})/) ?? url?.match(/whatsapp\.com\/send\/?\?.*phone=(\d{10,15})/);
    if (m) { whatsapp = m[1]; break; }
  }

  return {
    seguidores: asNum(isRecord(u.edge_followed_by) ? u.edge_followed_by.count : null),
    posts: asNum(timeline?.count),
    curtidas: likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null,
    foto: asStr(u.profile_pic_url_hd ?? u.profile_pic_url, 1200),
    bio: asStr(u.biography),
    verificado: u.is_verified === true,
    whatsapp,
    categoria: asStr(u.category_name, 120),
  };
}

/** Últimos posts: imagens, vídeos e legendas pra gerar site. */
export async function scMedia(handle: string): Promise<IgMediaData | null> {
  const d = await scFetch(`/v1/instagram/user/posts?handle=${encodeURIComponent(handle)}`);
  const raw = Array.isArray(d?.posts) ? d.posts : [];
  const nodes = raw.map((p) => isRecord(p) && isRecord(p.node) ? p.node : p).filter(isRecord);
  if (!nodes.length) return null;

  const media: IgMediaData = { images: [], videos: [], captions: [] };
  const pushImg = (v: unknown) => {
    const u = asStr(v, 1200);
    if (u?.startsWith("http") && media.images.length < 8 && !media.images.includes(u)) {
      media.images.push(u);
    }
  };
  for (const n of nodes) {
    const capEdges = isRecord(n.edge_media_to_caption) && Array.isArray(n.edge_media_to_caption.edges)
      ? n.edge_media_to_caption.edges : [];
    const cap = capEdges.length && isRecord(capEdges[0]) && isRecord(capEdges[0].node)
      ? asStr(capEdges[0].node.text) : null;
    if (cap) media.captions.push(cap);
    if (n.is_video === true || String(n.__typename ?? "").includes("Video")) {
      const vu = asStr(n.video_url, 1500);
      if (vu && media.videos.length < 2) {
        media.videos.push({ src: vu, titulo: cap?.split("\n")[0]?.slice(0, 80) || "Reel" });
      }
    }
    const kids = isRecord(n.edge_sidecar_to_children) && Array.isArray(n.edge_sidecar_to_children.edges)
      ? n.edge_sidecar_to_children.edges : [];
    if (kids.length) {
      for (const k of kids) {
        const kn = isRecord(k) && isRecord(k.node) ? k.node : null;
        if (kn) pushImg(kn.display_url);
      }
    } else {
      pushImg(n.display_url ?? n.thumbnail_src);
    }
  }
  media.captions = media.captions.slice(0, 10);
  return media.images.length || media.videos.length || media.captions.length ? media : null;
}

// ── Cache por handle ──────────────────────────────────────────

export async function igCacheGet<T>(handle: string, part: "perfil" | "media"): Promise<T | null> {
  try {
    const { data } = await serviceClient()
      .from("ig_cache").select(`${part}, ${part}_at`)
      .eq("handle", handle.toLowerCase()).maybeSingle();
    const row = data as Record<string, unknown> | null;
    const at = row?.[`${part}_at`] ? Date.parse(String(row[`${part}_at`])) : 0;
    if (row?.[part] && Date.now() - at < CACHE_MS) return row[part] as T;
  } catch { /* cache miss vira scrape */ }
  return null;
}

export async function igCachePut(handle: string, part: "perfil" | "media", value: unknown): Promise<void> {
  try {
    await serviceClient().from("ig_cache").upsert({
      handle: handle.toLowerCase(),
      [part]: value,
      [`${part}_at`]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch { /* cache é best-effort */ }
}

/** Perfil com cache: hit em 7d pula a chamada paga. */
export async function igProfileCached(handle: string): Promise<IgProfileData | null> {
  const hit = await igCacheGet<IgProfileData>(handle, "perfil");
  if (hit) return hit;
  const prof = await scProfile(handle);
  if (prof) await igCachePut(handle, "perfil", prof);
  return prof;
}

/** Mídia com cache: hit em 7d pula a chamada paga. */
export async function igMediaCached(handle: string): Promise<IgMediaData | null> {
  const hit = await igCacheGet<IgMediaData>(handle, "media");
  if (hit) return hit;
  const media = await scMedia(handle);
  if (media) await igCachePut(handle, "media", media);
  return media;
}
