// POST /api/crew - followers submit their car for the Crew page (multipart form with one photo).
// Everything lands as "pending"; nothing shows on the site until RJ approves it in the Studio.
import { json, db, str, sendEmail } from "../../lib/server.js";
import { supaAuth } from "../../lib/content.js";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function onRequestPost({ request, env }) {
  let f; try { f = await request.formData(); } catch { return json({ error: "Invalid submission." }, 400); }
  if (f.get("website")) return json({ ok: true });                       // honeypot
  const row = { name: str(f.get("name"), 80), handle: str(f.get("handle"), 60).replace(/^@?/, "@").replace(/^@$/, "") || null,
    email: str(f.get("email"), 160).toLowerCase() || null, car: str(f.get("car"), 120), story: str(f.get("story"), 1200) };
  if (!row.name || !row.car) return json({ error: "Add your name and your car." }, 400);
  if (f.get("consent") !== "yes") return json({ error: "Tick the box so RJ can feature your car." }, 400);
  const photo = f.get("photo");
  if (!photo || typeof photo === "string" || !TYPES[photo.type]) return json({ error: "Add a JPEG, PNG or WebP photo of your car." }, 400);
  if (photo.size > 4.5 * 1024 * 1024) return json({ error: "That photo is too big. Keep it under 4 MB." }, 400);
  const path = `crew/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}.${TYPES[photo.type]}`;
  try {
    const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/vv-media/${path}`, { method: "POST",
      headers: { ...supaAuth(env), "Content-Type": photo.type }, body: await photo.arrayBuffer() });
    if (!up.ok) throw new Error(await up.text());
    row.photo = `${env.SUPABASE_URL}/storage/v1/object/public/vv-media/${path}`;
    await db(env, "vv_crew", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) });
  } catch (err) { console.error(err); return json({ error: "Couldn't send that right now. Try again in a minute." }, 502); }
  await sendEmail(env, { to: (env.ORDER_NOTIFY_EMAIL || "thevolksvision@gmail.com"), subject: `New Crew car: ${row.car} from ${row.handle || row.name}`,
    text: `${row.name} ${row.handle || ""}\n${row.car}\n\n${row.story}\n\nApprove it in the Studio: More → Crew.` }).catch(() => {});
  return json({ ok: true });
}
