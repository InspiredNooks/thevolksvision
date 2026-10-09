// /api/admin/videos - RJ's video log (Studio → Grow → Videos).
// GET  last 365 days   POST {...} create/update   DELETE ?id=
import { db, json, adminRoute, str, UserError } from "../../../lib/server.js";

const PLATFORMS = ["TikTok", "Instagram", "YouTube", "Facebook"];
const count = v => { const n = Math.round(Number(String(v ?? "").replace(/[^0-9.kKmM]/g, "").replace(/k$/i, "e3").replace(/m$/i, "e6"))); return Number.isFinite(n) && n >= 0 ? Math.min(n, 2e9) : 0; };

function clean(b) {
  if (!PLATFORMS.includes(b.platform)) throw new UserError("Pick the platform.");
  const url = str(b.url, 400);
  if (url && !/^https:\/\//.test(url)) throw new UserError("The video link should start with https://");
  const posted = /^\d{4}-\d{2}-\d{2}$/.test(b.posted_on) ? b.posted_on : new Date().toISOString().slice(0, 10);
  const len = Math.round(Number(b.length_sec));
  return {
    platform: b.platform, url: url || null, title: str(b.title, 200), posted_on: posted,
    pillar: str(b.pillar, 30) || null, hook: str(b.hook, 30) || null,
    length_sec: len > 0 && len < 7200 ? len : null,
    views: count(b.views), likes: count(b.likes), comments: count(b.comments), shares: count(b.shares), saves: count(b.saves), follows: count(b.follows),
    notes: str(b.notes, 2000), updated_at: new Date().toISOString()
  };
}

export const onRequestGet = adminRoute(async ({ env }) => {
  const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  return json(await db(env, `vv_videos?select=*&posted_on=gte.${since}&order=posted_on.desc,id.desc`));
});

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  const row = clean(b);
  if (b.id) {
    const [saved] = await db(env, `vv_videos?id=eq.${Number(b.id)}`, { method: "PATCH", body: JSON.stringify(row) });
    if (!saved) throw new UserError("That video no longer exists.");
    return json(saved);
  }
  const [saved] = await db(env, "vv_videos", { method: "POST", body: JSON.stringify(row) });
  return json(saved);
});

export const onRequestDelete = adminRoute(async ({ request, env }) => {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) throw new UserError("Missing video.");
  await db(env, `vv_videos?id=eq.${id}`, { method: "DELETE" });
  return json({ deleted: id });
});
