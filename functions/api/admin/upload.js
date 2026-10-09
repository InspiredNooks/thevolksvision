// POST /api/admin/upload?kind=products|posts  - body is the image itself.
// The phone resizes photos to JPEG before sending, so files stay small and fast.
// Stores them in the public Supabase bucket "vv-media" and returns the public URL.
import { json, adminRoute, UserError } from "../../../lib/server.js";
import { supaAuth } from "../../../lib/content.js";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 4.5 * 1024 * 1024;   // Netlify request limit is 6 MB; phones resize photos well under this

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const type = (request.headers.get("Content-Type") || "").split(";")[0];
  if (!TYPES[type]) throw new UserError("Use a JPEG, PNG or WebP photo.");
  const body = await request.arrayBuffer();
  if (!body.byteLength) throw new UserError("The photo didn't come through. Try again.");
  if (body.byteLength > MAX) throw new UserError("That photo is too large. Try a smaller one.");
  const kind = new URL(request.url).searchParams.get("kind") === "posts" ? "posts" : "products";
  const path = `${kind}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}.${TYPES[type]}`;
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/vv-media/${path}`, {
    method: "POST",
    headers: { ...supaAuth(env), "Content-Type": type, "Cache-Control": "31536000" },
    body
  });
  if (!res.ok) { console.error(await res.text()); throw new Error("upload failed"); }
  return json({ url: `${env.SUPABASE_URL}/storage/v1/object/public/vv-media/${path}` });
});
