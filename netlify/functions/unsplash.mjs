// Unsplash proxy for Brand Mood Studio.
// The page calls /api/unsplash?query=…&page=…; this function adds the secret Access Key and asks Unsplash.
// Set the key in Netlify: Site configuration → Environment variables → UNSPLASH_ACCESS_KEY.

const MAX_QUERY = 80;
const MAX_PAGE = 10;

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  // Only answer requests made by pages on this same site (blocks other websites' pages from using it).
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return json({ error: "Forbidden" }, 403);

  const key = Netlify.env.get("UNSPLASH_ACCESS_KEY");
  if (!key) return json({ error: "UNSPLASH_ACCESS_KEY is not set on this site." }, 500);

  const url = new URL(req.url);
  const query = (url.searchParams.get("query") || "").trim().replace(/\s+/g, " ").toLowerCase();
  const page = Number(url.searchParams.get("page") || "1");
  if (!query || query.length > MAX_QUERY || !/^[\p{L}\p{N} '&-]+$/u.test(query)) return json({ error: "Invalid query" }, 400);
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) return json({ error: "Invalid page" }, 400);

  const params = new URLSearchParams({ query, page: String(page), per_page: "30", content_filter: "high" });
  let res;
  try {
    res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    });
  } catch {
    return json({ error: "Couldn't reach Unsplash" }, 502);
  }
  // 401 = bad key, 403 = hourly limit used up; pass these through so the page can fall back.
  if (!res.ok) return json({ error: `Unsplash returned ${res.status}` }, res.status === 401 || res.status === 403 ? res.status : 502);

  const data = await res.json();
  // Send only what the page needs.
  const results = (data.results || []).map((x) => ({
    id: x.id,
    alt_description: x.alt_description,
    description: x.description,
    color: x.color,
    width: x.width,
    height: x.height,
    urls: { raw: x.urls?.raw },
    links: { html: x.links?.html },
    user: { name: x.user?.name, links: { html: x.user?.links?.html } },
  }));

  return json({ total: data.total, total_pages: data.total_pages, results }, 200, {
    // Netlify's CDN keeps each search for 6 hours and shares it between all visitors,
    // so repeated searches don't use up the Unsplash hourly limit.
    "Netlify-CDN-Cache-Control": "public, durable, s-maxage=21600, stale-while-revalidate=86400",
    "Netlify-Vary": "query=query|page",
    "Cache-Control": "public, max-age=3600",
  });
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(status === 200 ? headers : { "Cache-Control": "no-store" }) },
  });
}

export const config = {
  path: "/api/unsplash",
  // Per-visitor limit, so one person can't burn through the Unsplash allowance.
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
