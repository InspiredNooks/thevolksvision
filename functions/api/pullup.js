// POST /api/pullup {id, email?, website} - fan taps "I'll pull up". Returns the live count.
// The count on the static page is refreshed from here, so it's always current.
// GET /api/pullup?ids=1,2 - current counts for upcoming stops.
import { json, db, str } from "../../lib/server.js";

export async function onRequestGet({ request, env }) {
  const ids = (new URL(request.url).searchParams.get("ids") || "").split(",").map(Number).filter(Boolean).slice(0, 20);
  if (!ids.length) return json({});
  const rows = await db(env, `vv_events?select=id,pullups&published=eq.true&id=in.(${ids.join(",")})`).catch(() => []);
  return json(Object.fromEntries(rows.map(r => [r.id, r.pullups])));
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (b.website) return json({ count: 0 });
  const id = Number(b.id); if (!id) return json({ error: "Missing event." }, 400);
  const email = str(b.email, 160).toLowerCase();
  try {
    const count = await db(env, "rpc/vv_pullup", { method: "POST", body: JSON.stringify({ eid: id }) });
    if (count == null) return json({ error: "That stop isn't on the list anymore." }, 404);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      await db(env, "vv_pullups", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ event_id: id, email }) });
      if (b.join === true) await db(env, "vv_subscribers?on_conflict=email", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ email, source: "pullup", lists: ["drops", "glovebox"] }) });
    }
    return json({ count });
  } catch (err) { console.error(err); return json({ error: "Couldn't save that right now. Try again." }, 502); }
}
