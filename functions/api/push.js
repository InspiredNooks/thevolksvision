// /api/push - phones turning notifications on or off.
// GET            the public signing key the browser needs to subscribe
// POST {subscription, role}   save a phone. role "admin" needs the Studio passphrase; everyone else is a fan.
// DELETE {endpoint}           turn alerts off for that phone
import { json, db, isAdmin } from "../../lib/server.js";
import { vapidKeys, sendPush } from "../../lib/push.js";

const validSub = s => s && typeof s.endpoint === "string" && /^https:\/\/[\w.-]+\//.test(s.endpoint) && s.endpoint.length < 1000
  && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;

export async function onRequestGet({ env }) {
  try { return json({ publicKey: (await vapidKeys(env)).publicKey }); }
  catch (err) { console.error(err); return json({ error: "Alerts are unavailable right now." }, 502); }
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (!validSub(b.subscription)) return json({ error: "That phone didn't send a valid subscription." }, 400);
  const admin = b.role === "admin";
  if (admin && !(await isAdmin(request, env))) return json({ error: "Wrong passphrase." }, 401);
  const row = { endpoint: b.subscription.endpoint, keys: { p256dh: b.subscription.keys.p256dh, auth: b.subscription.keys.auth }, role: admin ? "admin" : "fan" };
  try {
    await db(env, "vv_push?on_conflict=endpoint", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
    if (admin && b.test) await sendPush(env, "admin", { title: "VV Studio alerts are on ✅", body: "You'll hear about orders, brand inquiries and Crew cars here.", url: "/admin", tag: "test" });
  } catch (err) { console.error(err); return json({ error: "Couldn't turn alerts on. Try again." }, 502); }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (typeof b.endpoint !== "string") return json({ error: "Missing phone." }, 400);
  await db(env, `vv_push?endpoint=eq.${encodeURIComponent(b.endpoint)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  return json({ ok: true });
}
