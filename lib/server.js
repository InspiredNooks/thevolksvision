// Shared helpers for VolksVision Pages Functions.
// Env vars (Cloudflare Pages > Settings > Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  - server-only; never ship to the browser
//   ADMIN_TOKEN                              - long passphrase RJ uses to open /admin
//   MANAGER_TOKEN                            - Cara's own passphrase for the same Studio (optional)
//   DEPLOY_HOOK_URL                          - Cloudflare Pages deploy hook; rebuilds the site after edits
//   RESEND_API_KEY, ORDER_NOTIFY_EMAIL, ORDER_FROM_EMAIL (optional email alerts)
import { supa } from "./content.js";

export const db = supa;

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Constant-time comparison of the bearer token against each Studio passphrase:
// ADMIN_TOKEN (RJ) and MANAGER_TOKEN (Cara). Every one is checked, so timing reveals nothing.
export async function isAdmin(request, env) {
  const got = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const tokens = [env.ADMIN_TOKEN, env.MANAGER_TOKEN].filter(Boolean);
  if (!tokens.length || !got) return false;
  const enc = new TextEncoder();
  const hash = s => crypto.subtle.digest("SHA-256", enc.encode(s)).then(b => new Uint8Array(b));
  const mine = await hash(got);
  let ok = false;
  for (const t of tokens) {
    const y = await hash(t);
    let diff = 0;
    for (let i = 0; i < mine.length; i++) diff |= mine[i] ^ y[i];
    ok = ok || diff === 0;
  }
  return ok;
}

// Wraps an admin handler: checks the passphrase and turns thrown errors into JSON.
export const adminRoute = handler => async ctx => {
  if (!(await isAdmin(ctx.request, ctx.env))) return json({ error: "Wrong passphrase." }, 401);
  try { return await handler(ctx); }
  catch (err) {
    if (!err.status) console.error(err);       // validation messages aren't server errors
    const status = err.status || 502;
    return json({ error: status === 502 ? "The database didn't respond. Try again in a minute." : err.message }, status);
  }
};

export class UserError extends Error { constructor(msg) { super(msg); this.status = 400; } }

// Asks Cloudflare Pages to rebuild the public site so edits go live (about a minute).
export async function publishSite(env) {
  if (!env.DEPLOY_HOOK_URL) return false;
  const res = await fetch(env.DEPLOY_HOOK_URL, { method: "POST" });
  return res.ok;
}

export async function sendEmail(env, { to, subject, text, replyTo }) {
  if (!env.RESEND_API_KEY || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.ORDER_FROM_EMAIL || "VolksVision <shop@thevolksvision.com>", to, subject, text,
      ...(replyTo || env.REPLY_TO_EMAIL ? { reply_to: replyTo || env.REPLY_TO_EMAIL } : {}) })
  });
  return res.ok;
}

export const str = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

// ---------- Pit Crew email ----------
// Unsubscribe links carry an HMAC of the address, so nobody can unsubscribe someone else.
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
const listSecret = env => env.LIST_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
export const unsubToken = (env, email) => hmac(listSecret(env), email.toLowerCase());
export async function unsubLink(env, site, email) {
  return `${site}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${await unsubToken(env, email)}`;
}

// Sends one email per subscriber on `list` (Resend batch API, 100 per call).
export async function emailList(env, { list, subject, text, site }) {
  if (!env.RESEND_API_KEY) throw Object.assign(new Error("Email isn't switched on yet (RESEND_API_KEY missing)."), { status: 400 });
  const subs = await db(env, `vv_subscribers?select=email&unsubscribed=eq.false&lists=cs.{${list}}&limit=10000`);
  const from = env.ORDER_FROM_EMAIL || "VolksVision <shop@thevolksvision.com>";
  let sent = 0;
  for (let i = 0; i < subs.length; i += 100) {
    const batch = await Promise.all(subs.slice(i, i + 100).map(async s => {
      const link = await unsubLink(env, site, s.email);
      return { from, to: s.email, subject, text: `${text}\n\n—\nYou're getting this because you joined the VolksVision Pit Crew.\nUnsubscribe: ${link}`,
        headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
    }));
    const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(batch) });
    if (!r.ok) throw new Error(`Email send failed: ${await r.text()}`);
    sent += batch.length;
  }
  return sent;
}
