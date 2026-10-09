// POST /api/subscribe {email, source} - public "Get drop alerts" signup.
import { json, db, str } from "../../lib/server.js";

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (b.website) return json({ ok: true });                         // honeypot
  const email = str(b.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  try {
    const lists = ["drops", "glovebox"].filter(l => b[l] === "on" || b[l] === true || (Array.isArray(b.lists) && b.lists.includes(l)));
    if (!lists.length) return json({ error: "Pick at least one: drops or new posts." }, 400);
    await db(env, "vv_subscribers?on_conflict=email", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ email, source: str(b.source, 60) || null, lists, unsubscribed: false }) });
  } catch (err) { console.error(err); return json({ error: "Couldn't sign you up right now. Try again in a minute." }, 502); }
  return json({ ok: true });
}
