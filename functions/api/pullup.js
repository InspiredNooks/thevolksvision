// POST /api/pullup {id, email?, join?, website} - fan taps "I'm going". Counts once per visitor per stop. Returns the live count.
// The count on the static page is refreshed from here, so it's always current.
// GET /api/pullup?ids=1,2 - current counts for upcoming stops.
import { json, db, str, visitorKey } from "../../lib/server.js";

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
    // One count per visitor per stop: the row is only inserted the first time (unique event_id + who).
    const who = await visitorKey(env, request, `pullup:${id}`);
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    const fresh = await db(env, "vv_pullups?on_conflict=event_id,who", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ event_id: id, who, email: valid ? email : null }) }).catch(err => { if (/foreign key|23503/.test(String(err.message))) return null; throw err; });
    if (fresh === null) return json({ error: "That stop isn't on the list anymore." }, 404);
    let count;
    if (fresh.length) { count = await db(env, "rpc/vv_pullup", { method: "POST", body: JSON.stringify({ eid: id }) }); if (count == null) return json({ error: "That stop isn't on the list anymore." }, 404); }
    else count = (await db(env, `vv_events?select=pullups&id=eq.${id}`))[0]?.pullups ?? 0;
    if (valid && b.join === true) await db(env, "vv_subscribers?on_conflict=email", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ email, source: "pullup", lists: ["drops", "glovebox"] }) });
    return json({ count });
  } catch (err) { console.error(err); return json({ error: "Couldn't save that right now. Try again." }, 502); }
}
