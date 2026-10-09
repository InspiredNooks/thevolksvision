// POST /api/inquiry - public "Work with me" form for brands, collabs and shoots.
import { json, db, str, sendEmail } from "../../lib/server.js";
import { sendPush } from "../../lib/push.js";

const KINDS = ["Brand sponsorship", "Collab", "Photo or video shoot", "Wholesale", "Other"];

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (b.website) return json({ ok: true });                         // honeypot
  const row = { name: str(b.name, 120), email: str(b.email, 160).toLowerCase(), company: str(b.company, 120) || null,
    kind: KINDS.includes(b.kind) ? b.kind : "Other", message: str(b.message, 4000) };
  if (!row.name || !row.message) return json({ error: "Add your name and a message." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) return json({ error: "Enter a valid email address." }, 400);
  try { await db(env, "vv_inquiries", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) }); }
  catch (err) { console.error(err); return json({ error: "Couldn't send that right now. Try again in a minute." }, 502); }
  await sendPush(env, "admin", { title: `🤝 New ${row.kind.toLowerCase()} inquiry`, body: `${row.name}${row.company ? ` · ${row.company}` : ""}: ${row.message.slice(0, 90)}`, url: "/admin", tag: "inquiry" });
  await sendEmail(env, { to: (env.ORDER_NOTIFY_EMAIL || "thevolksvision@gmail.com"), subject: `New ${row.kind.toLowerCase()} inquiry from ${row.name}${row.company ? ` (${row.company})` : ""}`,
    text: `${row.name}\n${row.email}\n${row.company || ""}\n\n${row.message}\n\nReply from your email, then mark it replied in the Studio.` }).catch(() => {});
  return json({ ok: true });
}
