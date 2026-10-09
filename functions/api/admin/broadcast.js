// POST /api/admin/broadcast {list: "drops"|"glovebox", subject, body} - "Email the Pit Crew" from the Studio.
import { json, adminRoute, emailList, str, UserError } from "../../../lib/server.js";
import { getSettings } from "../../../lib/content.js";

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  if (!["drops", "glovebox"].includes(b.list)) throw new UserError("Pick who gets it.");
  const subject = str(b.subject, 120), text = str(b.body, 8000);
  if (!subject || text.length < 10) throw new UserError("Add a subject and a message.");
  const s = await getSettings(env);
  const sent = await emailList(env, { list: b.list, subject, text, site: (env.SITE_URL || s.siteUrl).replace(/\/$/, "") });
  return json({ sent });
});
