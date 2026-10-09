// /api/unsubscribe?e=&t= - Pit Crew unsubscribe.
// GET shows a confirm button (email scanners follow links, so a GET must never change anything).
// POST does the unsubscribe; that's also what one-click unsubscribe in Gmail/Apple Mail sends.
import { db, unsubToken } from "../../lib/server.js";

const page = (title, body, status = 200) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe | VolksVision</title><body style="margin:0;background:#0b0d0c;color:#eef0ec;font:18px/1.5 Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px"><main style="max-width:420px"><h1 style="font-size:24px;text-transform:uppercase">${title}</h1>${body}<p><a href="/" style="color:#f2a93b">Back to VolksVision</a></p></main>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

async function check(request, env) {
  const u = new URL(request.url), email = (u.searchParams.get("e") || "").toLowerCase(), t = u.searchParams.get("t") || "";
  return { email, ok: Boolean(email && t && t === await unsubToken(env, email)), qs: u.search };
}

export async function onRequestGet({ request, env }) {
  const { ok, qs } = await check(request, env);
  if (!ok) return page("That unsubscribe link didn't work.", "<p>Reply to any email and RJ will remove you.</p>", 400);
  return page("Leave the Pit Crew?", `<form method="post" action="/api/unsubscribe${qs.replace(/"/g, "&quot;")}"><button type="submit" style="font:inherit;padding:12px 22px;border-radius:999px;border:0;background:#eef0ec;color:#0b0d0c;cursor:pointer">Unsubscribe me</button></form>`);
}

export async function onRequestPost({ request, env }) {
  const { email, ok } = await check(request, env);
  if (!ok) return page("That unsubscribe link didn't work.", "<p>Reply to any email and RJ will remove you.</p>", 400);
  await db(env, `vv_subscribers?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ unsubscribed: true }) }).catch(() => {});
  return page("You're unsubscribed.", "<p>No more Pit Crew emails. You can rejoin from the site anytime.</p>");
}
