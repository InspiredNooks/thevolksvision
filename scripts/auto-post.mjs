// Writes one Journal post per run, in RJ's voice, and saves it to Supabase.
// Saved as a draft for RJ to approve (unless he switched on auto-publish in Settings), with photos:
// a cover and 1-2 in the post, from Unsplash (UNSPLASH_ACCESS_KEY) or his own Mk2 / library photos.
// RJ gets a phone notification and an email with a link to review, edit and publish it.
// Run weekly by .github/workflows/autoblog.yml.
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      optional DEPLOY_HOOK_URL, RESEND_API_KEY, ORDER_NOTIFY_EMAIL, ORDER_FROM_EMAIL
// Usage: node scripts/auto-post.mjs [--dry-run]
import Anthropic from "@anthropic-ai/sdk";
import { supa, getSettings, getProducts, getPosts, hasDb } from "../lib/content.js";
import { slugify } from "../lib/markdown.js";

const env = process.env;
const dryRun = process.argv.includes("--dry-run");
if (!hasDb(env) && !dryRun) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const [settings, products, posts] = await Promise.all([getSettings(env), getProducts(env), getPosts(env, { includeDrafts: true })]);
const SITE = (env.SITE_URL || settings.siteUrl).replace(/\/$/, "");
const topics = [...(settings.topics || [])];
const topic = topics.shift() || null;
const build = settings.build || {};
const stageLine = `Build status: ${build.status || "In the build"}; stages done: ${(build.stages || []).filter(x => x.done).map(x => x.name).join(", ") || "none yet"}. Unless the status says it runs, the Mk2 is NOT running yet; never say RJ drove it.`;
const carLine = build.car ? `His own car, the brand's hero, is a ${build.car}${build.engine ? ` (${build.engine})` : ""}. The build page is /build/.` : "";

const SYSTEM = `You write the Journal for VolksVision, a small creator brand run by RJ, a young car content creator in St. Petersburg, Florida. He films and photographs Volkswagens and tuner cars, with a focus on the Mk2 Jetta and classic water-cooled VWs, and sells his own shirts and merch. ${carLine} ${stageLine}

Voice: first person as RJ. Warm, plain-spoken, knowledgeable, a little dry humor. Short paragraphs. No hype words, no emoji, no exclamation marks.

Rules that protect the brand:
- Never invent specific events, dates, club names, businesses, people, prices or statistics. If a detail would need to be checked, write about it in general terms.
- Never claim RJ did something to his car unless it's in the build details given. Use "if you're doing this" framing instead.
- Mechanical advice must be conservative and widely accepted; tell readers to confirm with their manual or a trusted VW mechanic for anything safety-related.
- VolksVision is independent and not affiliated with Volkswagen AG. Don't imply otherwise.
- Never encourage street racing, takeovers, reckless driving or illegal modifications. Speed belongs at the track or a legal event.

Write to rank on Google:
- The title contains the target search phrase naturally and is under 65 characters.
- Answer the question the title promises in the first two paragraphs. Then go deeper than other pages would: specifics, steps, what to watch for, RJ's own perspective.
- Use the search phrase once in an ## heading, and related phrases people also search for in other headings.
- Include a short "Quick answer" or checklist section where it helps readers who skim.
- Link naturally to 1 or 2 of the products listed below and, where relevant, 1 earlier post or the build page, using the exact URL paths given. Never invent URLs.
- Mention Tampa Bay or St. Pete only where it genuinely fits.
- Body in Markdown using only ## and ### headings, paragraphs, - or 1. lists, **bold**, *italic*, > quotes and [text](/path) links. 900 to 1400 words. No H1 (the title is the H1).`;

const catalog = products.map(p => `- ${p.name}: /shop/${p.id}/`).join("\n");
const earlier = posts.filter(p => p.status === "published").slice(0, 25).map(p => `- ${p.title}: /journal/${p.slug}/`).join("\n");
const buildFacts = build.car ? `\n\nRJ's build (only facts you may state about his car):\n${build.car}\n${(build.specs || []).map(s => `- ${s.label}: ${s.value}`).join("\n")}` : "";
const prompt = (topic
  ? `Write the post for this brief.\nWorking title: ${topic.title}\nTarget search phrase: ${topic.keyword || topic.title}\nAngle: ${topic.angle || "RJ's practical, first-hand take."}`
  : `The idea list is empty. Pick a fresh, useful topic that people actually search for, about the Mk2 Jetta, classic water-cooled VWs, car photography or filming, or car culture in Florida. It must not repeat an earlier post.`)
  + buildFacts
  + `\n\nProducts you can link to:\n${catalog || "(none yet)"}\n\nEarlier posts (don't repeat them; link one if relevant):\n${earlier || "(none yet)"}`;

const client = new Anthropic();
const response = await client.beta.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  system: SYSTEM,
  output_config: {
    effort: "medium",
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "slug", "tags", "body"],
        properties: {
          title: { type: "string", description: "SEO title, under 65 characters, contains the search phrase" },
          description: { type: "string", description: "Meta description, 120-158 characters, makes someone want to click" },
          slug: { type: "string", description: "lowercase-hyphenated URL slug built around the search phrase, 3-7 words" },
          tags: { type: "array", items: { type: "string" }, description: "3-6 short lowercase tags" },
          body: { type: "string", description: "Markdown body without the title" }
        }
      }
    }
  },
  messages: [{ role: "user", content: prompt }]
});

if (response.stop_reason === "refusal") throw new Error(`Post declined: ${response.stop_details?.explanation || "no detail"}`);
if (response.stop_reason === "max_tokens") throw new Error("Post was cut off at max_tokens; not saving a partial post.");
const post = JSON.parse(response.content.filter(b => b.type === "text").map(b => b.text).join(""));

// Keep only links to pages that exist, so a made-up URL never ships.
const valid = new Set([...products.map(p => `/shop/${p.id}/`), ...posts.map(p => `/journal/${p.slug}/`), "/#shop", "/about/", "/journal/", "/build/"]);
const body = post.body.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (m, text, url) => valid.has(url) ? m : text);

// ---------- photos for the post ----------
// Unsplash first (searched by the topic), then RJ's own photos. He swaps any of them before approving.
async function findPhotos(query) {
  const out = [];
  if (env.UNSPLASH_ACCESS_KEY) {
    try {
      const r = await fetch(`https://api.unsplash.com/search/photos?${new URLSearchParams({ query, per_page: "6", orientation: "landscape", content_filter: "high" })}`,
        { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" } });
      if (r.ok) for (const p of (await r.json()).results || []) {
        out.push({ url: p.urls.regular, alt: p.alt_description || query, credit: `Photo: [${p.user.name}](${p.user.links.html}?utm_source=volksvision&utm_medium=referral) / [Unsplash](https://unsplash.com/?utm_source=volksvision&utm_medium=referral)` });
        if (p.links?.download_location) fetch(p.links.download_location, { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } }).catch(() => {});
      }
    } catch (e) { console.log(`Unsplash skipped: ${e.message}`); }
  }
  const own = [...(build.gallery || []).map(g => ({ url: g.url, alt: g.alt || build.car || "RJ's Mk2" })), ...(settings.library || []).map(g => ({ url: g.url, alt: g.label || "VolksVision" }))];
  for (const p of own.sort(() => Math.random() - .5)) out.push({ ...p, credit: "" });
  return out.slice(0, 3);
}
const photos = await findPhotos(topic?.keyword || post.tags?.[0] || "volkswagen");
let bodyWithPhotos = body;
if (photos.length > 1) {
  // Drop the extra photos in after the first and the middle section headings.
  const parts = body.split(/\n(?=## )/);
  const spots = [1, Math.max(2, Math.floor(parts.length / 2) + 1)];
  photos.slice(1).forEach((ph, i) => { const at = Math.min(spots[i], parts.length - 1); if (at > 0) parts[at] = parts[at].replace(/^(## .*\n)/, `$1\n![${ph.alt.replace(/[\[\]]/g, "")}](${ph.url}${ph.credit ? ` "${ph.credit.replace(/"/g, "'")}"` : ""})\n\n`); });
  bodyWithPhotos = parts.join("\n");
}
const cover = photos[0];
const coverCredit = cover?.credit ? `\n\n*Cover ${cover.credit.charAt(0).toLowerCase() + cover.credit.slice(1)}*` : "";

const taken = new Set(posts.map(p => p.slug));
const base = slugify(post.slug || post.title) || "post";
let slug = base; for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
const status = settings.autoPublish === false ? "draft" : "published";
const row = { slug, title: post.title.slice(0, 120), description: post.description.slice(0, 200), body: bodyWithPhotos + coverCredit, tags: post.tags.join(", "),
  status, date: new Date().toISOString().slice(0, 10), source: "auto",
  ...(cover ? { image: cover.url, image_alt: cover.alt.slice(0, 160) } : {}) };

if (dryRun) { console.log(JSON.stringify(row, null, 2)); process.exit(0); }

await supa(env, "vv_posts", { method: "POST", body: JSON.stringify(row) });
if (topic) {
  // Re-read what's stored right now (RJ may have saved settings while the post was being written)
  // and only remove the topic we used, so nothing else he changed is overwritten.
  const [cur] = await supa(env, "vv_settings?id=eq.1&select=data");
  const stored = cur?.data || {};
  await supa(env, "vv_settings?id=eq.1", { method: "PATCH", body: JSON.stringify({ data: { ...stored, topics: (stored.topics || []).filter(t => t.title !== topic.title) } }) });
}
console.log(`Saved "${row.title}" as ${status}.`);

if (status === "published" && env.DEPLOY_HOOK_URL) {
  const res = await fetch(env.DEPLOY_HOOK_URL, { method: "POST" });
  console.log(`Site rebuild requested: ${res.status}`);
}
// Tell the Pit Crew members who asked for new posts.
if (status === "published" && env.RESEND_API_KEY) {
  const { emailList } = await import("../lib/server.js");
  const sent = await emailList(env, { list: "glovebox", site: SITE, subject: `New in ${settings.journalName || "The Glovebox"}: ${row.title}`,
    text: `${row.description}\n\nRead it: ${SITE}/journal/${slug}/` }).catch(e => { console.log(`Pit Crew email skipped: ${e.message}`); return 0; });
  console.log(`Emailed ${sent} Pit Crew members.`);
}
// Ping RJ's phone (and Cara's) so the draft gets reviewed.
try {
  const { sendPush } = await import("../lib/push.js");
  await sendPush(env, "admin", status === "published"
    ? { title: `📰 New ${settings.journalName || "Glovebox"} post is live`, body: row.title, url: "/admin#posts", tag: "post" }
    : { title: `📝 New ${settings.journalName || "Glovebox"} draft to approve`, body: `${row.title}. Check the photos, then tap Publish.`, url: "/admin#posts", tag: "post" });
} catch (e) { console.log(`Push skipped: ${e.message}`); }
if (env.RESEND_API_KEY && (env.ORDER_NOTIFY_EMAIL || "thevolksvision@gmail.com")) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.ORDER_FROM_EMAIL || "VolksVision <shop@thevolksvision.com>", to: (env.ORDER_NOTIFY_EMAIL || "thevolksvision@gmail.com"),
      subject: status === "published" ? `New Journal post is live: ${row.title}` : `New Journal draft ready: ${row.title}`,
      text: `${status === "published" ? "This week's post just went live" : "This week's post is waiting for your approval"}:\n\n${row.title}\n${SITE}/journal/${slug}/\n\nRead it, add a photo, or change anything from your phone:\n${SITE}/admin#posts\n\nAdding one of your own photos with a description helps it rank.`
    })
  });
}
