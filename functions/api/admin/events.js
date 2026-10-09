// /api/admin/events - "Where is VolksVision next?" (Studio → Mk2 → Next stops).
// GET all   POST create/update (id)   POST {id, action: "approve"|"skip"} for scout finds   DELETE ?id=
// Saving finds the map pin from the address (or keeps the one RJ placed) and rebuilds the site.
import { db, json, adminRoute, publishSite, str, UserError } from "../../../lib/server.js";
import { geocode } from "../../../lib/geo.js";

const KINDS = ["meet", "show", "shoot", "drop", "reveal", "other"];
const coord = (v, lo, hi) => { const n = Number(v); return v !== null && v !== "" && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 1e5) / 1e5 : null; };
function clean(b) {
  const title = str(b.title, 120);
  if (!title) throw new UserError("Name the stop.");
  const starts = new Date(b.starts_at);
  if (isNaN(starts)) throw new UserError("Pick a date and time.");
  const ends = b.ends_at ? new Date(b.ends_at) : null;
  const link = str(b.link, 400);
  return { title, kind: KINDS.includes(b.kind) ? b.kind : "meet", starts_at: starts.toISOString(), ends_at: ends && !isNaN(ends) && ends > starts ? ends.toISOString() : null,
    venue: str(b.venue, 120) || null, address: str(b.address, 200) || null, city: str(b.city, 80) || "St. Petersburg, FL",
    link: /^https:\/\//.test(link) ? link : null, details: str(b.details, 2000), published: b.published !== false,
    lat: coord(b.lat, 24, 31), lng: coord(b.lng, -88, -79), rj_going: b.rj_going !== false };
}
export const onRequestGet = adminRoute(async ({ env }) => json(await db(env, "vv_events?select=*&review=is.null&order=starts_at.desc&limit=200")
  .then(async mine => [...mine, ...await db(env, `vv_events?select=*&review=eq.pending&starts_at=gte.${new Date(Date.now() - 864e5).toISOString()}&order=starts_at.asc&limit=60`)])));

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  if (b.action === "approve" || b.action === "skip") {
    const id = Number(b.id); if (!id) throw new UserError("Missing stop.");
    const patch = b.action === "approve" ? { review: null, published: true, rj_going: b.rj_going === true } : { review: "skipped", published: false };
    const [saved] = await db(env, `vv_events?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (!saved) throw new UserError("That stop no longer exists.");
    return json({ event: saved, live: b.action === "approve" ? await publishSite(env) : false });
  }
  const row = clean(b);
  if (row.lat == null || row.lng == null || b.relocate === true) {
    // Only look it up again when the place changed (or it never had a pin).
    const prev = b.id ? (await db(env, `vv_events?id=eq.${Number(b.id)}&select=venue,address,city,lat,lng`))[0] : null;
    const moved = !prev || prev.venue !== row.venue || prev.address !== row.address || prev.city !== row.city || prev.lat == null;
    if (moved || b.relocate === true) { const g = await geocode(row); if (g) Object.assign(row, { lat: g.lat, lng: g.lng }); }
    else Object.assign(row, { lat: prev.lat, lng: prev.lng });
  }
  const [saved] = b.id ? await db(env, `vv_events?id=eq.${Number(b.id)}`, { method: "PATCH", body: JSON.stringify(row) }) : await db(env, "vv_events", { method: "POST", body: JSON.stringify(row) });
  if (!saved) throw new UserError("That stop no longer exists.");
  return json({ event: saved, live: await publishSite(env) });
});
export const onRequestDelete = adminRoute(async ({ request, env }) => {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) throw new UserError("Missing stop.");
  await db(env, `vv_events?id=eq.${id}`, { method: "DELETE" });
  return json({ deleted: id, live: await publishSite(env) });
});
