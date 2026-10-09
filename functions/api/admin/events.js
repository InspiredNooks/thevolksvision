// /api/admin/events - "Where is VolksVision next?" (Studio → Mk2 → Next stops).
// GET all   POST create/update (id)   DELETE ?id=      Saving rebuilds the site.
import { db, json, adminRoute, publishSite, str, UserError } from "../../../lib/server.js";

const KINDS = ["meet", "show", "shoot", "drop", "reveal", "other"];
function clean(b) {
  const title = str(b.title, 120);
  if (!title) throw new UserError("Name the stop.");
  const starts = new Date(b.starts_at);
  if (isNaN(starts)) throw new UserError("Pick a date and time.");
  const ends = b.ends_at ? new Date(b.ends_at) : null;
  const link = str(b.link, 400);
  return { title, kind: KINDS.includes(b.kind) ? b.kind : "meet", starts_at: starts.toISOString(), ends_at: ends && !isNaN(ends) && ends > starts ? ends.toISOString() : null,
    venue: str(b.venue, 120) || null, address: str(b.address, 200) || null, city: str(b.city, 80) || "St. Petersburg, FL",
    link: /^https:\/\//.test(link) ? link : null, details: str(b.details, 2000), published: b.published !== false };
}
export const onRequestGet = adminRoute(async ({ env }) => json(await db(env, "vv_events?select=*&order=starts_at.desc&limit=200")));
export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json(), row = clean(b);
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
