// Pinterest board reader for Brand Mood Studio.
// The page calls /api/pinterest?board=<board link>; this function reads the board's public RSS feed
// (pinterest.com/<user>/<board>.rss), which lists the board's 25 most recent pins.
// Works for public boards only. Short links (pin.it/…) are followed to the board first.

const PINTEREST_HOST = /^([a-z]{2,3}\.)?(www\.)?pinterest\.(com|ca|fr|de|es|it|jp|ru|ch|at|se|dk|nz|ie|ph|pt|cl|co\.uk|co\.kr|com\.au|com\.mx)$/i;
const RESERVED = new Set(["pin", "search", "ideas", "today", "_", "settings", "business", "url_shortener", "explore", "videos", "categories", "topics", "shopping"]);
const UA = "Mozilla/5.0 (compatible; BrandMoodStudio/1.0)";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return json({ error: "Forbidden" }, 403);

  const input = (new URL(req.url).searchParams.get("board") || "").trim();
  if (!input || input.length > 300) return json({ error: "Paste a Pinterest board link." }, 400);

  let boardUrl;
  try {
    boardUrl = await resolveBoardUrl(input);
  } catch (e) {
    return json({ error: e.message }, 400);
  }

  const feedUrl = `https://www.pinterest.com/${boardUrl.user}/${boardUrl.board}.rss`;
  let res;
  try {
    res = await fetch(feedUrl, { headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml" } });
  } catch {
    return json({ error: "Couldn't reach Pinterest." }, 502);
  }
  if (res.status === 404) return json({ error: "That board wasn't found. Check the link, and make sure the board is public (secret boards can't be read)." }, 404);
  if (!res.ok) return json({ error: `Pinterest returned an error (${res.status}).` }, 502);

  const xml = await res.text();
  const channel = xml.split("<item>")[0];
  const title = decode(tag(channel, "title")) || boardUrl.board.replace(/-/g, " ");
  const pins = [];
  for (const chunk of xml.split("<item>").slice(1)) {
    const link = decode(tag(chunk, "link"));
    const desc = decode(tag(chunk, "description"));
    const src = (desc.match(/<img[^>]+src="([^"]+)"/i) || [])[1];
    if (!src || !/^https:\/\/i\.pinimg\.com\//.test(src)) continue;
    pins.push({
      id: (link.match(/\/pin\/([^/]+)/) || [])[1] || src,
      title: decode(tag(chunk, "title")).trim(),
      href: /^https:\/\/([a-z]+\.)?pinterest\.[a-z.]+\/pin\//.test(link) ? link : "",
      img: src.replace(/\/\d+x\//, "/736x/"), // the feed lists small 236px images; 736px is Pinterest's standard large size
    });
  }
  if (!pins.length) return json({ error: "That board has no pins yet, or Pinterest didn't share them." }, 404);

  return json({ board: { title, url: `https://www.pinterest.com/${boardUrl.user}/${boardUrl.board}/`, user: boardUrl.user }, pins }, 200, {
    // Share each board between visitors for 3 hours, so new pins show up within a few hours.
    "Netlify-CDN-Cache-Control": "public, durable, s-maxage=10800, stale-while-revalidate=3600",
    "Netlify-Vary": "query=board",
    "Cache-Control": "public, max-age=600",
  });
};

// Accepts full board links (any Pinterest country domain) and pin.it short links.
async function resolveBoardUrl(input) {
  let url;
  try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch { throw new Error("That doesn't look like a link."); }

  for (let hop = 0; hop < 4 && /^(www\.)?pin\.it$|^api\.pinterest\.com$/i.test(url.hostname); hop++) {
    const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA } }).catch(() => null);
    const next = r?.headers.get("location");
    if (!next) throw new Error("That short link didn't lead anywhere. Try the board's full link.");
    url = new URL(next, url);
  }
  if (!PINTEREST_HOST.test(url.hostname)) throw new Error("Paste a link to a Pinterest board (pinterest.com/…).");

  const [user, board] = url.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  if (!user || RESERVED.has(user.toLowerCase())) throw new Error("That's not a board link. Open the board on Pinterest and copy its link.");
  if (!board) throw new Error("That's a profile link. Open one of its boards and copy that link instead.");
  if (!/^[\w.-]{1,80}$/.test(user) || !/^[\p{L}\p{N}_.%-]{1,120}$/u.test(board)) throw new Error("That board link looks unusual. Try copying it again.");
  return { user, board: encodeURIComponent(board) };
}

function tag(s, name) {
  const m = s.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "") : "";
}
function decode(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
}
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(status === 200 ? headers : { "Cache-Control": "no-store" }) },
  });
}

export const config = {
  path: "/api/pinterest",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
