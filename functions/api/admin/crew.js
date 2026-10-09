// /api/admin/crew - review follower car submissions.
// GET  all   PATCH {id, status?, featured?}  (approving or featuring rebuilds the site)
import { db, json, adminRoute, publishSite, UserError } from "../../../lib/server.js";

export const onRequestGet = adminRoute(async ({ env }) => json(await db(env, "vv_crew?select=*&order=created_at.desc&limit=300")));

export const onRequestPatch = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  if (!Number.isInteger(b.id)) throw new UserError("Missing submission.");
  const patch = {};
  if (b.status !== undefined) { if (!["pending", "approved", "rejected"].includes(b.status)) throw new UserError("Unknown status."); patch.status = b.status; }
  if (b.featured !== undefined) patch.featured = b.featured === true;
  if (patch.featured) {  // one Crew car of the week at a time
    await db(env, "vv_crew?featured=eq.true", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ featured: false }) });
    patch.status = "approved";
  }
  const [row] = await db(env, `vv_crew?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  const live = await publishSite(env);
  return json({ crew: row, live });
});
