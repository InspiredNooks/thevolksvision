// /api/admin/orders - RJ's order desk. Requires "Authorization: Bearer <ADMIN_TOKEN>".
// GET   ?status=paid        list orders (newest first, up to 500)
// PATCH {id, status?, notes?, tracking?}   update one order
import { ORDER_STATUSES } from "../../../catalog.js";
import { json, db, adminRoute, UserError } from "../../../lib/server.js";

export const onRequestGet = adminRoute(async ({ request, env }) => {
  const status = new URL(request.url).searchParams.get("status");
  const filter = status && ORDER_STATUSES.includes(status) ? `&status=eq.${status}` : "";
  return json(await db(env, `vv_orders?select=*&order=created_at.desc&limit=500${filter}`));
});

export const onRequestPatch = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  if (!Number.isInteger(b.id)) throw new UserError("Missing order id.");
  const patch = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) {
    if (!ORDER_STATUSES.includes(b.status)) throw new UserError("Unknown status.");
    patch.status = b.status;
  }
  if (b.notes !== undefined) patch.notes = String(b.notes).slice(0, 4000);
  if (b.tracking !== undefined) patch.tracking = String(b.tracking).slice(0, 200);
  const rows = await db(env, `vv_orders?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return json(rows[0] || null);
});
