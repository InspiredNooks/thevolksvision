// Background function (the "-background" filename lets it run up to 15 minutes; Netlify answers 202 right away).
// Runs the story writer or the event-post writer started by /api/admin/write.
import { isAdmin } from "../../lib/server.js";
import { writeStory, writeEventPost } from "../../lib/writer.js";

export default async (request) => {
  const env = process.env;
  if (!(await isAdmin(request, env))) return;
  const job = await request.json().catch(() => null); if (!job) return;
  try {
    if (job.kind === "story") await writeStory(env, job.input);
    if (job.kind === "event" && Number.isInteger(job.postId)) await writeEventPost(env, job.input, job.postId);
  } catch (err) {
    console.error("writer failed", err);
    if (job.kind === "story") {
      const { db } = await import("../../lib/server.js");
      const [cur] = await db(env, "vv_settings?id=eq.1&select=data");
      await db(env, "vv_settings?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ data: { ...(cur?.data || {}), story: { ...(cur?.data?.story || {}), status: "failed", error: String(err.message).slice(0, 200) } } }) }).catch(() => {});
    }
  }
};
