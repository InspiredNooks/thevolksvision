// Background function (runs up to 15 minutes; Netlify answers 202 right away).
// Runs the event scout started from the Studio: a full scan, or one shared post.
import { isAdmin } from "../../lib/server.js";
import { scanEvents, eventFromPost } from "../../lib/scout.js";
import { sendPush } from "../../lib/push.js";

export default async (request) => {
  const env = process.env;
  if (!(await isAdmin(request, env))) return;
  const job = await request.json().catch(() => null); if (!job) return;
  try {
    if (job.mode === "scan") await scanEvents(env);
    if (job.mode === "post") {
      const added = await eventFromPost(env, job.input || {});
      if (!added.length) await sendPush(env, "admin", { title: "Couldn't find a new event in that post", body: "It may already be on your list, or the date has passed. Add it by hand with + Add a stop.", url: "/admin#build", tag: "scout" });
    }
  } catch (err) {
    console.error("scout failed", err);
    await sendPush(env, "admin", { title: "The event finder hit a problem", body: String(err.message).slice(0, 120), url: "/admin#build", tag: "scout" }).catch(() => {});
  }
};
