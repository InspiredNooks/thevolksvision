// POST /api/subscribe {email, source, drops, glovebox} - public Pit Crew signup.
// New address: added. Existing subscriber: lists merged. Someone who unsubscribed is never re-added
// from a form; they get a "tap to rejoin" email instead, so nobody can re-subscribe someone else.
// GET /api/subscribe?rejoin=<email>&t=<token> - the link in that email.
import { json, db, str, sendEmail } from "../../lib/server.js";
import { getSettings } from "../../lib/content.js";

async function token(env, email) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LIST_SECRET || env.SUPABASE_SERVICE_ROLE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("rejoin:" + email)));
  return [...sig].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function onRequestPost({ request, env }) {
  if ((request.headers.get("content-type") || "").includes("application/x-www-form-urlencoded")) return confirmRejoin(env, await request.formData());
  let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (b.website) return json({ ok: true });                         // honeypot
  const email = str(b.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  const lists = ["drops", "glovebox"].filter(l => b[l] === "on" || b[l] === true || (Array.isArray(b.lists) && b.lists.includes(l)));
  if (!lists.length) return json({ error: "Pick at least one: drops or new posts." }, 400);
  try {
    const [row] = await db(env, `vv_subscribers?email=eq.${encodeURIComponent(email)}&select=lists,unsubscribed`);
    if (!row) {
      await db(env, "vv_subscribers", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ email, source: str(b.source, 60) || null, lists }) });
    } else if (!row.unsubscribed) {
      const merged = [...new Set([...(row.lists || []), ...lists])];
      await db(env, `vv_subscribers?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ lists: merged }) });
    } else {
      const S = await getSettings(env);
      const link = `${S.siteUrl}/api/subscribe?rejoin=${encodeURIComponent(email)}&t=${await token(env, email)}`;
      await sendEmail(env, { to: email, subject: "Rejoin the VolksVision Pit Crew?", text: `Someone (hopefully you) asked to rejoin the Pit Crew with this address.\n\nTap to confirm: ${link}\n\nDidn't ask? Ignore this email and nothing changes.` });
    }
  } catch (err) { console.error(err); return json({ error: "Couldn't sign you up right now. Try again in a minute." }, 502); }
  return json({ ok: true });
}

const page = (inner, status = 200) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pit Crew | VolksVision</title><body style="margin:0;background:#0b0d0c;color:#eef0ec;font:18px/1.5 Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px"><main style="max-width:420px">${inner}<p><a href="/" style="color:#f2a93b">Back to VolksVision</a></p></main>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
const h1 = t => `<h1 style="font-size:24px;text-transform:uppercase">${t}</h1>`;
const attr = v => String(v).replace(/[&"<>]/g, c => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]);

// The emailed rejoin link only shows a button. Email scanners open links, so a GET must never change anything.
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url), email = (u.searchParams.get("rejoin") || "").toLowerCase(), t = u.searchParams.get("t") || "";
  if (!(email && t && t === await token(env, email))) return page(h1("That link didn't work. Sign up again on the site."), 400);
  return page(`${h1("Rejoin the Pit Crew?")}<form method="post" action="/api/subscribe"><input type="hidden" name="rejoin" value="${attr(email)}"><input type="hidden" name="t" value="${attr(t)}">
    <button type="submit" style="font:700 16px Arial,sans-serif;text-transform:uppercase;background:#f2a93b;color:#0b0d0c;border:0;padding:14px 20px;cursor:pointer">Yes, rejoin</button></form>`);
}
async function confirmRejoin(env, form) {
  const email = String(form.get("rejoin") || "").toLowerCase(), t = String(form.get("t") || "");
  if (!(email && t && t === await token(env, email))) return page(h1("That link didn't work. Sign up again on the site."), 400);
  await db(env, `vv_subscribers?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ unsubscribed: false }) }).catch(() => {});
  return page(h1("You're back in the Pit Crew."));
}
