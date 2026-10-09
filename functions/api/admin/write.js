// POST /api/admin/write - starts the story writer or the event-post writer in the background.
// {kind: "story", notes, extra, photos}  -> writes settings.story (unpublished) for RJ to review
// {kind: "event", name, date, place, notes, photos} -> creates a draft post now and fills it in
// The Studio polls for the result. Needs ANTHROPIC_API_KEY.
import { json, db, adminRoute, str, UserError } from "../../../lib/server.js";
import { writeStory, writeEventPost } from "../../../lib/writer.js";

const cleanPhotos = list => (Array.isArray(list) ? list : []).slice(0, 8).map(p => ({
  url: str(p?.url, 500), alt: str(p?.alt, 160), credit: str(p?.credit, 200) })).filter(p => /^https:\/\//.test(p.url));

export const onRequestPost = adminRoute(async ({ request, env, waitUntil }) => {
  if (!env.ANTHROPIC_API_KEY) throw new UserError("The writer isn't switched on yet (ANTHROPIC_API_KEY missing in Netlify).");
  const b = await request.json();
  const notes = str(b.notes, 8000);
  if (notes.length < 40) throw new UserError("Tell it a bit more first: a few sentences at least.");
  const photos = cleanPhotos(b.photos);
  let job;
  if (b.kind === "story") {
    const [cur] = await db(env, "vv_settings?id=eq.1&select=data");
    const data = cur?.data || {};
    await db(env, "vv_settings?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ data: { ...data, story: { ...(data.story || {}), status: "writing", started: new Date().toISOString() } } }) });
    job = { kind: "story", input: { notes, extra: str(b.extra, 3000), photos } };
  } else if (b.kind === "event") {
    const [row] = await db(env, "vv_posts", { method: "POST", body: JSON.stringify({ slug: `writing-${Date.now()}`, title: `Writing: ${str(b.name, 80) || "your post"}…`, body: "", status: "draft", source: "rj" }) });
    job = { kind: "event", postId: row.id, input: { name: str(b.name, 120), date: str(b.date, 40), place: str(b.place, 120), notes, photos } };
  } else throw new UserError("Unknown writer.");

  if (env.PLATFORM === "netlify") {
    await fetch(new URL("/.netlify/functions/writer-background", request.url), { method: "POST", headers: { Authorization: request.headers.get("Authorization"), "Content-Type": "application/json" }, body: JSON.stringify(job) });
  } else {
    const run = job.kind === "story" ? writeStory(env, job.input) : writeEventPost(env, job.input, job.postId);
    waitUntil?.(run.catch(e => console.error(e)));
  }
  return json({ pending: true, postId: job.postId || null }, 202);
});
