// The Studio's writers (run in a background function, so long writing never times out):
//  - writeStory: turns RJ's own telling of how VolksVision started into a newsworthy, search-friendly feature.
//  - writeEventPost: turns notes + photos from a meet, shoot or build day into a Glovebox post (saved as a draft).
// Claude looks at the photos, so captions and alt text describe what's actually in them.
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./server.js";
import { getSettings } from "./content.js";
import { slugify } from "./markdown.js";
import { sendPush } from "./push.js";

const HARD_LINES = `Never invent facts: no made-up dates, names, places, numbers, quotes, sponsors or events. Only use what RJ wrote and what is plainly visible in the photos; if something is unclear, leave it out.
Quotes must be RJ's own words from his notes (you may trim them). Don't name people in photos unless RJ named them.
VolksVision is independent and not affiliated with Volkswagen AG. Never encourage street racing, takeovers or reckless driving.
No hype words, no emoji, no exclamation marks.`;

const imageBlocks = photos => photos.slice(0, 8).flatMap((p, i) => [
  { type: "text", text: `PHOTO ${i + 1}:` },
  { type: "image", source: { type: "url", url: p.url } }
]);

async function ask(env, system, content, schema, effort = "medium") {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5", max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    system, output_config: { effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }]
  });
  if (res.stop_reason === "refusal") throw new Error("The writer declined this one. Try rewording the notes.");
  if (res.stop_reason === "max_tokens") throw new Error("The writing ran too long. Try shorter notes.");
  return JSON.parse(res.content.filter(c => c.type === "text").map(c => c.text).join(""));
}

// Replaces [[PHOTO n]] markers with Markdown photos (alt from the writer, caption = credit).
function placePhotos(body, photos, alts, skipFirst = false) {
  const used = new Set(skipFirst ? [0] : []);              // the cover photo is shown at the top already
  let out = body.replace(/\[\[PHOTO\s*(\d+)\]\]/gi, (m, n) => {
    const i = +n - 1, p = photos[i]; if (!p || used.has(i)) return ""; used.add(i);
    return `\n\n![${(alts[i] || p.alt || "").replace(/[\[\]]/g, "")}](${p.url}${p.credit ? ` "${p.credit.replace(/"/g, "'")}"` : ""})\n\n`;
  });
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- the VolksVision story ----------
const STORY_SCHEMA = { type: "object", additionalProperties: false, required: ["headline", "dek", "seoTitle", "description", "body", "pullQuote", "boilerplate", "alts", "pitchAngles"],
  properties: {
    headline: { type: "string", description: "Newsworthy feature headline, under 80 characters" },
    dek: { type: "string", description: "One-sentence standfirst under the headline" },
    seoTitle: { type: "string", description: "Search title under 60 characters, includes VolksVision and a phrase people search" },
    description: { type: "string", description: "Meta description, 120-158 characters" },
    body: { type: "string", description: "Markdown feature, 650-1000 words, ## headings only, [[PHOTO n]] markers on their own lines" },
    pullQuote: { type: "string", description: "RJ's strongest line, quoted from his notes" },
    boilerplate: { type: "string", description: "'About VolksVision' paragraph for press releases, 50-80 words, third person" },
    alts: { type: "array", items: { type: "string" }, description: "Alt text for each photo in order, describing what is in it" },
    pitchAngles: { type: "array", items: { type: "string" }, description: "3 short angles a local reporter or podcast would bite on" }
  } };

export async function writeStory(env, input) {
  const s = await getSettings(env);
  const build = s.build || {};
  const system = `You are a feature writer for a local news site and an SEO editor. You are turning RJ's own telling of how VolksVision started into the definitive, newsworthy story of the brand: the kind of piece a Tampa Bay paper or car site would run, and the page Google shows when people search for him.
Who: ${s.ownerName || "RJ Savell Keelin"}, ${s.ownerTitle || "owner, operator and key influencer"} of VolksVision, a car content and merch brand from St. Petersburg, Florida. He is 20. His project car, the heart of the brand, is a ${build.car || "Mk2 Volkswagen Jetta"}; status: ${build.status || "in the build"} (unless that says it runs, the car is NOT running yet; never imply he drives it).
Write it as a feature with a real news hook in the first paragraph (why this, why now, why here), then the origin, the car, the community and what's next. Third person with RJ's own words as quotes. Specific, human, grounded. Use ## headings people would search ("How VolksVision started", "The Mk2 Jetta build", "Car culture in St. Pete" style) and work in phrases like VolksVision, RJ's full name, Mk2 Jetta build, St. Petersburg / Tampa Bay car scene naturally, never stuffed.
Place each provided photo once with a [[PHOTO n]] marker on its own line where it fits the story.
${HARD_LINES}`;
  const content = [{ type: "text", text: `RJ's story, in his own words:\n${input.notes}\n${input.extra ? `\nMore details he wants included:\n${input.extra}` : ""}` }, ...imageBlocks(input.photos || [])];
  const out = await ask(env, system, content, STORY_SCHEMA, "high");
  const story = { headline: out.headline, dek: out.dek, seoTitle: out.seoTitle, description: out.description, pullQuote: out.pullQuote,
    boilerplate: out.boilerplate, pitchAngles: out.pitchAngles, body: placePhotos(out.body, input.photos || [], out.alts),
    photos: (input.photos || []).map((p, i) => ({ url: p.url, alt: out.alts[i] || p.alt || "" })), notes: input.notes, extra: input.extra || "",
    published: false, updated: new Date().toISOString(), status: "ready" };
  const [cur] = await db(env, "vv_settings?id=eq.1&select=data");
  await db(env, "vv_settings?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ data: { ...(cur?.data || {}), story } }) });
  await sendPush(env, "admin", { title: "✨ Your VolksVision story is written", body: "Read it, change anything, then switch on Published.", url: "/admin", tag: "story" });
}

// ---------- a post from an event or build day ----------
const POST_SCHEMA = { type: "object", additionalProperties: false, required: ["title", "description", "slug", "tags", "body", "alts"],
  properties: {
    title: { type: "string", description: "Under 65 characters, includes the event or activity and the place when given" },
    description: { type: "string", description: "Meta description, 120-158 characters" },
    slug: { type: "string", description: "lowercase-hyphenated, 3-7 words" },
    tags: { type: "array", items: { type: "string" }, description: "3-6 short lowercase tags" },
    body: { type: "string", description: "Markdown, 500-900 words, ## headings, [[PHOTO n]] markers on their own lines" },
    alts: { type: "array", items: { type: "string" }, description: "Alt text for each photo in order" }
  } };

export async function writeEventPost(env, input, postId) {
  const s = await getSettings(env);
  const system = `You write ${s.journalName || "The Glovebox"}, the blog of VolksVision: RJ, a 20-year-old car creator in St. Petersburg, Florida, building a ${s.build?.car || "Mk2 Jetta"} (status: ${s.build?.status || "in the build"}; unless that says it runs, it is not running yet).
Turn his notes and photos from an event, shoot or build day into a post people will search for and share: first person as RJ, warm, plain-spoken, a little dry humor, short paragraphs.
Open with what it was, where and when (only if given) and the one thing worth knowing. Then what happened, the cars or parts that stood out (only what's in the notes or plainly visible), lessons or tips, and what's next. End with a line inviting readers to the next one or to send their car to the Crew page (/crew/).
Use [[PHOTO n]] markers on their own lines to place every photo once, near the part of the story it shows. Write useful alt text for each.
${HARD_LINES}`;
  const facts = [input.name && `What: ${input.name}`, input.date && `When: ${input.date}`, input.place && `Where: ${input.place}`].filter(Boolean).join("\n");
  const content = [{ type: "text", text: `${facts}\n\nRJ's notes:\n${input.notes}` }, ...imageBlocks(input.photos || [])];
  try {
    const out = await ask(env, system, content, POST_SCHEMA);
    const photos = input.photos || [];
    const taken = new Set((await db(env, "vv_posts?select=slug")).map(r => r.slug));
    const base = slugify(out.slug || out.title) || "post"; let slug = base; for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    const cover = photos[0];
    await db(env, `vv_posts?id=eq.${postId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
      title: out.title.slice(0, 120), description: out.description.slice(0, 200), slug, tags: out.tags.join(", "),
      body: placePhotos(out.body, photos, out.alts, true) + (cover?.credit ? `\n\n*${cover.credit.replace(/^Photo by/, "Cover photo by")}*` : ""),
      ...(cover ? { image: cover.url, image_alt: (out.alts[0] || cover.alt || "").slice(0, 160) } : {}),
      status: "draft", updated_at: new Date().toISOString() }) });
    await sendPush(env, "admin", { title: "📝 Your post is written", body: `${out.title}. Check it, then Publish.`, url: "/admin#posts", tag: "post" });
  } catch (err) {
    await db(env, `vv_posts?id=eq.${postId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ title: "Couldn't write this one", body: `The writer hit a problem: ${err.message}\n\nYour notes:\n\n${input.notes}`, status: "draft" }) }).catch(() => {});
    throw err;
  }
}
