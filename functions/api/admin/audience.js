// /api/admin/audience - drop-alert signups and brand inquiries.
// GET  -> {subscribers, inquiries}     PATCH {id, status} -> update an inquiry
import { json, db, adminRoute, UserError } from "../../../lib/server.js";

export const onRequestGet = adminRoute(async ({ env }) => {
  const [subscribers, inquiries] = await Promise.all([
    db(env, "vv_subscribers?select=*&order=created_at.desc&limit=5000"),
    db(env, "vv_inquiries?select=*&order=created_at.desc&limit=500")
  ]);
  return json({ subscribers, inquiries });
});

export const onRequestPatch = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  if (!Number.isInteger(b.id) || !["new", "replied", "closed"].includes(b.status)) throw new UserError("Missing inquiry or status.");
  const [row] = await db(env, `vv_inquiries?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify({ status: b.status }) });
  return json(row);
});
