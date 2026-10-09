// POST /api/admin/scout - starts the event scout in the background.
// {mode: "scan"}                       read RJ's sources + search the web for car events
// {mode: "post", text, url, image}     turn one shared post / screenshot into a stop
// New finds land in Studio → Mk2 → Next stops → Found for you. Needs ANTHROPIC_API_KEY.
import { json, adminRoute, str, UserError } from "../../../lib/server.js";
import { scanEvents, eventFromPost } from "../../../lib/scout.js";

export const onRequestPost = adminRoute(async ({ request, env, waitUntil }) => {
  if (!env.ANTHROPIC_API_KEY) throw new UserError("The event finder isn't switched on yet (ANTHROPIC_API_KEY missing in Netlify).");
  const b = await request.json();
  let job;
  if (b.mode === "scan") job = { mode: "scan" };
  else if (b.mode === "post") {
    const input = { text: str(b.text, 4000), url: str(b.url, 500), image: str(b.image, 500) };
    if (input.url && !/^https:\/\//.test(input.url)) input.url = "";
    if (input.image && !/^https:\/\//.test(input.image)) input.image = "";
    if (!input.text && !input.url && !input.image) throw new UserError("Paste the post, a link, or add a screenshot first.");
    job = { mode: "post", input };
  } else throw new UserError("Unknown request.");
  if (env.PLATFORM === "netlify") {
    await fetch(new URL("/.netlify/functions/scout-background", request.url), { method: "POST", headers: { Authorization: request.headers.get("Authorization"), "Content-Type": "application/json" }, body: JSON.stringify(job) });
  } else {
    const run = job.mode === "scan" ? scanEvents(env) : eventFromPost(env, job.input);
    waitUntil?.(run.catch(e => console.error(e)));
  }
  return json({ pending: true }, 202);
});
