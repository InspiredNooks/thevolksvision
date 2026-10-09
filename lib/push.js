// Web push notifications (works on iPhone once the site or Studio is on the Home Screen, and on Android/desktop).
// The signing keys (VAPID) are generated once by the server and kept in the private vv_secrets table,
// so there's nothing to set up in Netlify. Phones are stored in vv_push: role "admin" (RJ/Cara) or "fan".
import { db } from "./server.js";

const CONTACT = "mailto:shop@thevolksvision.com";
let cached = null;

export async function vapidKeys(env) {
  if (cached) return cached;
  const rows = await db(env, "vv_secrets?key=in.(vapid_public,vapid_private)&select=key,value");
  let pub = rows.find(r => r.key === "vapid_public")?.value, priv = rows.find(r => r.key === "vapid_private")?.value;
  if (!pub || !priv) {
    const { default: webpush } = await import("web-push");
    const k = webpush.generateVAPIDKeys();
    // ignore-duplicates: if two requests race, the first pair wins and both re-read it below.
    await db(env, "vv_secrets?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify([{ key: "vapid_public", value: k.publicKey }, { key: "vapid_private", value: k.privateKey }]) });
    const again = await db(env, "vv_secrets?key=in.(vapid_public,vapid_private)&select=key,value");
    pub = again.find(r => r.key === "vapid_public").value; priv = again.find(r => r.key === "vapid_private").value;
  }
  return (cached = { publicKey: pub, privateKey: priv });
}

// Sends to every phone with that role. Dead subscriptions (uninstalled, permission removed) are cleaned up.
// payload: { title, body, url, tag }
export async function sendPush(env, role, payload) {
  try {
    const subs = await db(env, `vv_push?role=eq.${role}&select=id,endpoint,keys&limit=5000`);
    if (!subs.length) return 0;
    const [{ default: webpush }, keys] = await Promise.all([import("web-push"), vapidKeys(env)]);
    webpush.setVapidDetails(CONTACT, keys.publicKey, keys.privateKey);
    const body = JSON.stringify({ title: payload.title, body: payload.body || "", url: payload.url || "/", tag: payload.tag || "" });
    let sent = 0; const dead = [];
    for (let i = 0; i < subs.length; i += 50) {
      await Promise.all(subs.slice(i, i + 50).map(s => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 86400, urgency: role === "admin" ? "high" : "normal" })
        .then(() => { sent++; }, err => { if (err.statusCode === 404 || err.statusCode === 410) dead.push(s.id); else console.error("push failed", err.statusCode || err.message); })));
    }
    if (dead.length) await db(env, `vv_push?id=in.(${dead.join(",")})`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    return sent;
  } catch (err) { console.error("push error", err); return 0; }
}
