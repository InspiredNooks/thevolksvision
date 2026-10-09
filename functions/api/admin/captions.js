// POST /api/admin/captions {about, pillar, hook, series?} -> a caption for every platform.
// Used by Post Everywhere in the Studio. Needs ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { json, adminRoute, str, UserError } from "../../../lib/server.js";
import { getSettings } from "../../../lib/content.js";

const SYSTEM = `You write social captions for RJ Savell Keelin (@thevolksvision), a 20-year-old car creator in St. Petersburg, FL whose brand VolksVision centers on his Mk2 VW Jetta and the Gen Z car scene.

Voice: RJ's own. Casual, confident, funny when it fits, never cringe, never corporate. Gen Z car people can smell a try-hard caption. Short lines. At most one or two emoji, only if natural.

Every caption:
- Opens with a line that makes someone stop or comment (a question, a hot take, a "you pick").
- Ends with ONE ask, varied: comment something specific, follow for the next episode, or "Pit Crew link in bio" for drops.
- Hashtags: 3-5, specific to the car scene and the content (e.g. #mk2jetta #vw #volkswagen #carsoftiktok #watercooled), no spammy generic tags.
- Never mention street racing, takeovers or anything illegal; never claim facts about his car that weren't given.
- If the post is sponsored or features a gifted product, include #ad.`;

const SCHEMA = { type: "object", additionalProperties: false, required: ["tiktok", "instagram", "youtube_title", "youtube_description", "facebook", "on_screen_hook", "pinned_comment"],
  properties: {
    tiktok: { type: "string", description: "TikTok caption with hashtags, under 300 characters" },
    instagram: { type: "string", description: "Instagram Reels caption with line breaks and hashtags, under 600 characters" },
    youtube_title: { type: "string", description: "YouTube Shorts title under 70 characters, ends with #shorts" },
    youtube_description: { type: "string", description: "2-3 short lines plus 3 hashtags" },
    facebook: { type: "string", description: "Facebook Reels caption, plain and friendly, under 300 characters" },
    on_screen_hook: { type: "string", description: "Text to put on screen in the first second, under 45 characters" },
    pinned_comment: { type: "string", description: "A comment RJ pins to start the conversation" }
  } };

// Long-form YouTube kit: what wins clicks and search on longer build videos.
const LONG_SCHEMA = { type: "object", additionalProperties: false, required: ["titles", "description", "tags", "thumbnail_text", "pinned_comment", "short_teaser"],
  properties: {
    titles: { type: "array", items: { type: "string" }, description: "3 YouTube title options under 70 characters: one curiosity, one searchable (e.g. 'Mk2 Jetta ...'), one episode-style" },
    description: { type: "string", description: "YouTube description: 2-line hook, what happens, a CHAPTERS block with placeholder timestamps (0:00 Intro, then 4-8 sections from the video description), links line (website, Pit Crew, shop), 3 hashtags" },
    tags: { type: "array", items: { type: "string" }, description: "10-15 YouTube tags, specific (mk2 jetta, vw jetta build, project car...)" },
    thumbnail_text: { type: "array", items: { type: "string" }, description: "3 options of 2-4 word thumbnail text, ALL CAPS, high-curiosity" },
    pinned_comment: { type: "string" },
    short_teaser: { type: "string", description: "TikTok/Reels caption for a 30-second teaser that points to the full video on YouTube" }
  } };

export const onRequestPost = adminRoute(async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) throw new UserError("Caption writing isn't switched on yet (ANTHROPIC_API_KEY missing in Netlify).");
  const b = await request.json();
  const about = str(b.about, 600);
  if (about.length < 5) throw new UserError("Say what the video is about first.");
  const s = await getSettings(env);
  const facts = (s.build?.specs || []).map(x => `${x.label}: ${x.value}`).join("; ");
  const long = b.format === "long";
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5", max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: long ? "medium" : "low", format: { type: "json_schema", schema: long ? LONG_SCHEMA : SCHEMA } },
    messages: [{ role: "user", content: `Video: ${about}
Pillar: ${str(b.pillar, 40) || "not set"}. Opening: ${str(b.hook, 40) || "not set"}.${b.sponsored ? " This post is sponsored or features a gifted product." : ""}${(() => { const sp = (s.sponsors || []).find(x => x.name === b.sponsor); return sp ? ` Sponsor: ${sp.name}${sp.tagline ? ` (${sp.tagline})` : ""}. Thank them naturally, include #ad${sp.disclosure ? ` and this required disclosure line exactly: "${sp.disclosure}"` : ""}. ${sp.url ? `Mention their link is in bio.` : ""}` : ""; })()}
His car: ${s.build?.car || "Mk2 Volkswagen Jetta"}${facts ? ` (${facts})` : ""}. Build status: ${s.build?.status || "In the build"}; stages done: ${(s.build?.stages || []).filter(x => x.done).map(x => x.name).join(", ") || "none yet"}. Unless the status says it runs, the car is not running yet: never imply he drove it.
${long ? "This is a LONG-FORM YouTube video (several minutes). Write the long-form YouTube kit." : "Write the captions."}` }]
  });
  if (res.stop_reason === "refusal") throw new UserError("Couldn't write captions for that one. Try describing it differently.");
  return json(JSON.parse(res.content.filter(c => c.type === "text").map(c => c.text).join("")));
});
