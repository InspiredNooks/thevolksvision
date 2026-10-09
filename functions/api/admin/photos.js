// GET /api/admin/photos?q=mk2 jetta&page=1 - free photo search for the mockup maker (Unsplash, plus Pexels if keyed).
// POST {download_location} - tells Unsplash a photo was used (their API rules require it).
// Env: UNSPLASH_ACCESS_KEY (free at unsplash.com/developers), optional PEXELS_API_KEY.
// License: fine for ads, posters and mockups; not for printing the unaltered photo as the product itself.
import { json, adminRoute, str, UserError } from "../../../lib/server.js";

export const onRequestGet = adminRoute(async ({ request, env }) => {
  const u = new URL(request.url), q = str(u.searchParams.get("q"), 80) || "volkswagen", page = Math.max(1, Math.min(20, +u.searchParams.get("page") || 1));
  if (!env.UNSPLASH_ACCESS_KEY && !env.PEXELS_API_KEY) return json({ off: true, photos: [] });
  const out = [];
  if (env.UNSPLASH_ACCESS_KEY) {
    const r = await fetch(`https://api.unsplash.com/search/photos?${new URLSearchParams({ query: q, page, per_page: "24", content_filter: "high" })}`,
      { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" } });
    if (r.ok) for (const p of (await r.json()).results || []) out.push({ source: "Unsplash", id: p.id, thumb: p.urls.small, full: p.urls.regular,
      w: p.width, h: p.height, alt: p.alt_description || "", by: p.user?.name || "", byUrl: `${p.user?.links?.html || "https://unsplash.com"}?utm_source=volksvision&utm_medium=referral`, download: p.links?.download_location || "" });
  }
  if (env.PEXELS_API_KEY) {
    const r = await fetch(`https://api.pexels.com/v1/search?${new URLSearchParams({ query: q, page, per_page: "18" })}`, { headers: { Authorization: env.PEXELS_API_KEY } });
    if (r.ok) for (const p of (await r.json()).photos || []) out.push({ source: "Pexels", id: String(p.id), thumb: p.src.medium, full: p.src.large2x,
      w: p.width, h: p.height, alt: p.alt || "", by: p.photographer || "", byUrl: p.photographer_url || "https://pexels.com", download: "" });
  }
  return json({ photos: out });
});

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  const loc = str(b.download_location, 500);
  if (!/^https:\/\/api\.unsplash\.com\//.test(loc)) throw new UserError("Not an Unsplash photo.");
  if (env.UNSPLASH_ACCESS_KEY) await fetch(loc, { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } }).catch(() => {});
  return json({ ok: true });
});
