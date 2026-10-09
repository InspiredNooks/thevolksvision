// /api/admin/plan - RJ's private growth plan (Studio → Grow). Never published to the site.
// GET               every item
// POST {...}        create (no id) or update (id) one item
// POST {import:true} load the starter plan (only when the plan is empty)
// DELETE ?id=       remove an item
import { SECTIONS, TASKS, IDEAS } from "../../../content/growth-plan.js";
import { db, json, adminRoute, str, UserError } from "../../../lib/server.js";

const KINDS = ["section", "task", "idea", "metric"];
const PILLARS = ["Build log", "Scene", "Know-how", "Behind VolksVision"];
const PLATFORMS = ["TikTok", "Instagram", "YouTube"];
const STAGES = ["idea", "filmed", "posted"];
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

function clean(b) {
  if (!KINDS.includes(b.kind)) throw new UserError("Unknown item type.");
  const row = { kind: b.kind, title: str(b.title, 200), body: str(b.body, 20000), done: b.done === true,
    sort: int(b.sort, -100000, 100000) ?? 100, updated_at: new Date().toISOString() };
  if (b.kind === "section" && !row.title) throw new UserError("Give the section a title.");
  if (b.kind === "task") { if (!row.title) throw new UserError("Describe the task."); row.data = { week: int(b.data?.week, 1, 52) ?? 1 }; }
  if (b.kind === "idea") {
    if (!row.title) throw new UserError("Describe the idea.");
    const link = str(b.data?.link, 300);
    row.data = { pillar: str(b.data?.pillar, 30) || PILLARS[0], platform: PLATFORMS.includes(b.data?.platform) ? b.data.platform : PLATFORMS[0],
      stage: STAGES.includes(b.data?.stage) ? b.data.stage : "idea", link: /^https:\/\//.test(link) ? link : "" };
  }
  if (b.kind === "metric") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.data?.date) ? b.data.date : new Date().toISOString().slice(0, 10);
    row.title = date;
    row.data = { date, tiktok: int(b.data?.tiktok, 0, 1e9), instagram: int(b.data?.instagram, 0, 1e9), youtube: int(b.data?.youtube, 0, 1e9),
      posts: int(b.data?.posts, 0, 1000), sales: int(b.data?.sales, 0, 1e6) };
  }
  return row;
}

export const onRequestGet = adminRoute(async ({ env }) => json(await db(env, "vv_plan?select=*&order=kind.asc,sort.asc,id.asc")));

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  if (b.import) {
    const existing = await db(env, "vv_plan?select=id&limit=1");
    if (existing.length) throw new UserError("Your plan already has content.");
    const rows = [
      ...SECTIONS.map((s, i) => ({ kind: "section", title: s.title, body: s.body, data: {}, sort: (i + 1) * 10 })),
      ...TASKS.map(t => ({ kind: "task", title: t.title, body: "", data: { week: t.week }, sort: t.sort })),
      ...IDEAS.map(x => ({ kind: "idea", title: x.title, body: "", data: { pillar: x.pillar, platform: x.platform, stage: "idea", link: "" }, sort: x.sort }))
    ];
    await db(env, "vv_plan", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
    return json(await db(env, "vv_plan?select=*&order=kind.asc,sort.asc,id.asc"));
  }
  const row = clean(b);
  if (b.id) {
    const [saved] = await db(env, `vv_plan?id=eq.${Number(b.id)}`, { method: "PATCH", body: JSON.stringify(row) });
    if (!saved) throw new UserError("That item no longer exists.");
    return json(saved);
  }
  const [saved] = await db(env, "vv_plan", { method: "POST", body: JSON.stringify(row) });
  return json(saved);
});

export const onRequestDelete = adminRoute(async ({ request, env }) => {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) throw new UserError("Missing item.");
  await db(env, `vv_plan?id=eq.${id}`, { method: "DELETE" });
  return json({ deleted: id });
});
