// One-time: copies the starter products, posts, settings and topic ideas into Supabase,
// so RJ can edit all of it from his phone. Safe to re-run: existing rows are left alone.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Usage: node scripts/seed.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS } from "../catalog.js";
import { SECTIONS, TASKS, IDEAS } from "../content/growth-plan.js";
import { supa, hasDb, DEFAULT_SETTINGS } from "../lib/content.js";

const env = process.env;
if (!hasDb(env)) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const quiet = { Prefer: "resolution=ignore-duplicates,return=minimal" };

await supa(env, "vv_products?on_conflict=id", { method: "POST", headers: quiet, body: JSON.stringify(
  PRODUCTS.map((p, i) => ({ id: p.id, name: p.name, cat: p.cat, price: p.price, sizes: p.sizes, tag: p.tag || null, blurb: p.blurb,
    exif: p.exif || null, art: p.art, image: p.image || null, stripe: p.stripe || null, active: true, sort: (i + 1) * 10 }))) });
console.log(`Products: ${PRODUCTS.length} checked`);

const dir = path.join(root, "content/posts");
const posts = fs.readdirSync(dir).filter(f => f.endsWith(".md")).map(f => {
  const [, front, body] = fs.readFileSync(path.join(dir, f), "utf8").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = Object.fromEntries(front.split("\n").map(l => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim().replace(/^"(.*)"$/, "$1")]));
  return { slug: f.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, ""), title: meta.title, description: meta.description, body: body.trim(),
    tags: meta.tags || "", date: meta.date, status: "published", source: "rj" };
});
await supa(env, "vv_posts?on_conflict=slug", { method: "POST", headers: quiet, body: JSON.stringify(posts) });
console.log(`Posts: ${posts.length} checked`);

const [current] = await supa(env, "vv_settings?id=eq.1&select=data");
const topics = JSON.parse(fs.readFileSync(path.join(root, "content/topics.json"), "utf8"));
const { siteUrl, brand, city, ...editable } = DEFAULT_SETTINGS;
const data = { ...editable, topics, ...(current?.data || {}) };     // never overwrite what RJ already changed
await supa(env, "vv_settings?id=eq.1", { method: "PATCH", body: JSON.stringify({ data }) });
console.log(`Settings saved with ${data.topics.length} post ideas`);

const planRows = await supa(env, "vv_plan?select=id&limit=1");
if (!planRows.length) {
  await supa(env, "vv_plan", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([
    ...SECTIONS.map((x, i) => ({ kind: "section", title: x.title, body: x.body, data: {}, sort: (i + 1) * 10 })),
    ...TASKS.map(t => ({ kind: "task", title: t.title, body: "", data: { week: t.week }, sort: t.sort })),
    ...IDEAS.map(x => ({ kind: "idea", title: x.title, body: "", data: { pillar: x.pillar, platform: x.platform, stage: "idea", link: "" }, sort: x.sort }))
  ]) });
  console.log(`Growth plan: ${SECTIONS.length} sections, ${TASKS.length} tasks, ${IDEAS.length} ideas`);
} else console.log("Growth plan: already loaded, left as is");

const deals = await supa(env, "vv_deals?select=id&limit=1");
if (!deals.length) {
  await supa(env, "vv_deals", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(
    (DEFAULT_SETTINGS.sponsors || []).map(sp => ({ brand: sp.name, status: "signed", value: 0, deliverables: "", notes: "First sponsor. Fill in the value, deliverables and due date." }))) });
  console.log("Deals: added the first sponsors to the pipeline");
}
