// Sonda local: testa web_profile_info do Instagram com sessionid.
// Uso: node scripts/ig-probe-local.mjs <sessionid> [handle]
const sessionid = decodeURIComponent(process.argv[2] ?? "");
const handle = process.argv[3] ?? "philiberato.tattoo";
if (!sessionid) { console.error("precisa do sessionid"); process.exit(1); }

const url = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`;
const t0 = Date.now();
const res = await fetch(url, {
  headers: {
    "X-IG-App-ID": "936619743392459",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Cookie": `sessionid=${sessionid}`,
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": `https://www.instagram.com/${handle}/`,
  },
  signal: AbortSignal.timeout(20_000),
}).catch((e) => ({ ok: false, status: `network:${e.message}` }));

console.log(`status: ${res.status} (${Date.now() - t0}ms)`);
if (!res.ok) {
  const body = await res.text?.().catch(() => "") ?? "";
  console.log("body:", body.slice(0, 400));
  process.exit(1);
}
const data = await res.json();
const u = data?.data?.user ?? data?.user;
if (!u) { console.log("sem user no json:", JSON.stringify(data).slice(0, 300)); process.exit(1); }
const posts = u.edge_owner_to_timeline_media?.edges ?? [];
console.log(`@${u.username} | seguidores: ${u.edge_followed_by?.count} | posts: ${u.edge_owner_to_timeline_media?.count} | verificado: ${u.is_verified}`);
console.log(`bio: ${(u.biography ?? "").slice(0, 80)}`);
console.log(`foto: ${u.profile_pic_url_hd ? "SIM" : "não"} | posts retornados: ${posts.length}`);
const p0 = posts[0]?.node;
if (p0) {
  console.log(`post[0]: video:${p0.is_video ? "S" : "N"} likes:${p0.edge_liked_by?.count} img:${p0.display_url ? "S" : "N"} vid:${p0.video_url ? "S" : "N"}`);
  console.log(`caption[0]: ${(p0.edge_media_to_caption?.edges?.[0]?.node?.text ?? "").slice(0, 100)}`);
}
