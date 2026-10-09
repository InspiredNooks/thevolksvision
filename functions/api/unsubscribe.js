// GET/POST /api/unsubscribe?e=&t= - one-click unsubscribe from Pit Crew emails.
import { db, unsubToken } from "../../lib/server.js";

async function handle({ request, env }) {
  const u = new URL(request.url), email = (u.searchParams.get("e") || "").toLowerCase(), t = u.searchParams.get("t") || "";
  const ok = email && t && t === await unsubToken(env, email);
  if (ok) await db(env, `vv_subscribers?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ unsubscribed: true }) }).catch(() => {});
  const msg = ok ? "You're unsubscribed. No more Pit Crew emails." : "That unsubscribe link didn't work. Reply to any email and RJ will remove you.";
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe | VolksVision</title><body style="margin:0;background:#0b0d0c;color:#eef0ec;font:18px/1.5 Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px"><main style="max-width:420px"><h1 style="font-size:24px;text-transform:uppercase">${msg}</h1><p><a href="/" style="color:#f2a93b">Back to VolksVision</a></p></main>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
export const onRequestGet = handle;
export const onRequestPost = handle;
