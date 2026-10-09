// POST /api/admin/broadcast {list: "drops"|"glovebox", subject, body, push} - "Email the Pit Crew" from the Studio.
// push: true also sends a phone notification to every fan who turned on alerts.
import { json, adminRoute, emailList, str, UserError } from "../../../lib/server.js";
import { getSettings } from "../../../lib/content.js";
import { sendPush } from "../../../lib/push.js";

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  if (!["drops", "glovebox"].includes(b.list)) throw new UserError("Pick who gets it.");
  const subject = str(b.subject, 120), text = str(b.body, 8000);
  if (!subject || text.length < 10) throw new UserError("Add a subject and a message.");
  const s = await getSettings(env);
  const site = (env.SITE_URL || s.siteUrl).replace(/\/$/, "");
  const sent = b.emailOff ? 0 : await emailList(env, { list: b.list, subject, text, site });
  const pushed = b.push ? await sendPush(env, "fan", { title: subject, body: text.replace(/\s+/g, " ").slice(0, 140), url: b.list === "drops" ? "/#shop" : "/journal/", tag: b.list }) : 0;
  return json({ sent, pushed });
});
