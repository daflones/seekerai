// Sonda: testa se o IP do edge consegue falar com o Instagram.
// POST {handle, sessionid?} — sessionid também pode vir de Deno.env.
import { isRecord, json } from "../_shared/common.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "POST" }, 405);
  const body = await req.json().catch(() => ({}));
  const handle = (isRecord(body) ? String(body.handle ?? "") : "").replace(/[^A-Za-z0-9._]/g, "") || "instagram";
  const sid = String(isRecord(body) ? body.sessionid ?? "" : "")
    || Deno.env.get("IG_SESSIONID") || "";
  const cookie = sid ? `sessionid=${decodeURIComponent(sid)}` : "";
  const H: Record<string, string> = { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" };
  if (cookie) H.Cookie = cookie;

  const results: Record<string, unknown> = { handle, sidUsada: Boolean(sid) };

  // 1) web_profile_info — o endpoint chave
  const r1 = await fetch(
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
    { headers: { ...H, "X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(15_000) },
  ).catch((e) => null);
  results.api = { status: r1?.status ?? "net" };
  if (r1?.ok) {
    const d = await r1.json().catch(() => null);
    const u = isRecord(d?.data?.user) ? d.data.user : null;
    const posts = isRecord(u?.edge_owner_to_timeline_media) ? (u!.edge_owner_to_timeline_media as Record<string, unknown>) : null;
    results.api.dados = u ? {
      seguidores: isRecord(u.edge_followed_by) ? u.edge_followed_by.count : null,
      posts: posts?.count,
      postsRetornados: Array.isArray(posts?.edges) ? posts.edges.length : 0,
      bio: (u.biography as string)?.slice(0, 60),
      foto: Boolean(u.profile_pic_url_hd),
      verificado: u.is_verified === true,
    } : "sem-user";
  }

  // 2) página HTML do perfil (com sessão)
  const r2 = await fetch(`https://www.instagram.com/${handle}/`, { headers: H, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const html = r2?.ok ? await r2.text() : "";
  results.pagina = {
    status: r2?.status ?? "net",
    errorPage: html.includes("httpErrorPage"),
    temJson: html.includes("edge_followed_by") || html.includes("xdt_api__v1__users"),
  };

  return json(results);
});
