// /api/admin/posts - RJ writes, edits and approves Journal posts from his phone.
// GET            all posts, drafts included
// POST {...}     create (no id) or update (id); publishing rebuilds the site
// DELETE ?id=    remove a post
import { db, json, adminRoute, publishSite, str, UserError } from "../../../lib/server.js";
import { getPosts } from "../../../lib/content.js";
import { slugify, plainText } from "../../../lib/markdown.js";

function clean(b) {
  const title = str(b.title, 120);
  if (!title) throw new UserError("Give the post a title.");
  const body = str(b.body, 40000);
  const status = b.status === "draft" ? "draft" : "published";
  if (status === "published" && body.length < 200) throw new UserError("The post is too short to publish. Save it as a draft, or keep writing.");
  const image = str(b.image, 500);
  if (image && !/^https:\/\//.test(image) && !image.startsWith("/")) throw new UserError("Photo link must start with https://");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : new Date().toISOString().slice(0, 10);
  // A good meta description is ~155 characters; write one from the body if RJ leaves it blank.
  let description = str(b.description, 200);
  if (!description) { const t = plainText(body); description = t.length > 155 ? t.slice(0, 152).replace(/\s+\S*$/, "") + "…" : t; }
  return {
    title, body, status, date, description,
    tags: str(b.tags, 200),
    image: image || null,
    image_alt: str(b.image_alt, 160) || null,
    updated_at: new Date().toISOString()
  };
}

export const onRequestGet = adminRoute(async ({ env }) => json(await getPosts(env, { includeDrafts: true })));

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  const row = clean(b);
  let saved;
  if (b.id) {
    // The slug never changes after creation, so links and Google rankings survive title edits.
    [saved] = await db(env, `vv_posts?id=eq.${Number(b.id)}`, { method: "PATCH", body: JSON.stringify(row) });
    if (!saved) throw new UserError("That post no longer exists.");
  } else {
    const base = slugify(b.slug || row.title) || "post";
    const taken = new Set((await db(env, `vv_posts?select=slug&slug=like.${encodeURIComponent(base)}*`)).map(r => r.slug));
    let slug = base; for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    [saved] = await db(env, "vv_posts", { method: "POST", body: JSON.stringify({ ...row, slug, source: "rj" }) });
  }
  const live = await publishSite(env);
  return json({ post: saved, live });
});

export const onRequestDelete = adminRoute(async ({ request, env }) => {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) throw new UserError("Missing post.");
  await db(env, `vv_posts?id=eq.${id}`, { method: "DELETE" });
  const live = await publishSite(env);
  return json({ deleted: id, live });
});
