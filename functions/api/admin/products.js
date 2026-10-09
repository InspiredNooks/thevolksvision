// /api/admin/products - RJ manages the shop from his phone.
// GET            all products, hidden ones included
// POST {...}     create or update (by id); the site rebuilds after saving
// DELETE ?id=    remove a product
// POST {import: true}  first-run: copy the starter catalog into the database
import { PRODUCTS } from "../../../catalog.js";
import { db, json, adminRoute, publishSite, str, UserError } from "../../../lib/server.js";
import { getProducts } from "../../../lib/content.js";
import { slugify } from "../../../lib/markdown.js";

const ART = ["tee", "hoodie", "cap", "sticker", "key", "print"];

function clean(b) {
  const name = str(b.name, 80);
  if (!name) throw new UserError("Give the product a name.");
  const price = Math.round(Number(b.price) * 100) / 100;
  if (!(price >= 0 && price < 10000)) throw new UserError("Price must be a number, like 28 or 28.50.");
  const sizes = (Array.isArray(b.sizes) ? b.sizes : String(b.sizes || "").split(","))
    .map(s => str(s, 20)).filter(Boolean).slice(0, 12);
  const image = str(b.image, 500);
  if (image && !/^https:\/\//.test(image) && !image.startsWith("/")) throw new UserError("Photo link must start with https://");
  const stripe = str(b.stripe, 300);
  if (stripe && !/^https:\/\/(buy\.stripe\.com|checkout\.stripe\.com)\//.test(stripe)) throw new UserError("Stripe link should start with https://buy.stripe.com/");
  return {
    name, price, sizes: sizes.length ? sizes : ["One size"],
    cat: slugify(b.cat || "wear").slice(0, 20) || "wear",
    tag: str(b.tag, 20) || null,
    blurb: str(b.blurb, 300),
    details: str(b.details, 6000),
    exif: str(b.exif, 30) || null,
    art: ART.includes(b.art) ? b.art : "tee",
    image: image || null,
    image_alt: str(b.image_alt, 160) || null,
    stripe: stripe || null,
    active: b.active !== false,
    sold_out: b.sold_out === true,
    sort: Number.isFinite(+b.sort) ? Math.round(+b.sort) : 100,
    updated_at: new Date().toISOString()
  };
}

export const onRequestGet = adminRoute(async ({ env }) => json(await getProducts(env, { includeHidden: true })));

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  if (b.import) {
    const rows = PRODUCTS.map((p, i) => ({ id: p.id, ...clean({ ...p, sort: (i + 1) * 10 }) }));
    await db(env, "vv_products?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(rows) });
    await publishSite(env);
    return json({ imported: rows.length });
  }
  const row = clean(b);
  let id = b.id ? slugify(b.id) : "";
  if (!id) {                                      // new product: build a unique URL slug from the name
    const base = slugify(row.name) || "product";
    const taken = new Set((await db(env, `vv_products?select=id&id=like.${encodeURIComponent(base)}*`)).map(r => r.id));
    id = base; for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    const [saved] = await db(env, "vv_products", { method: "POST", body: JSON.stringify({ id, ...row }) });
    const live = await publishSite(env);
    return json({ product: saved, live });
  }
  const [saved] = await db(env, `vv_products?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(row) });
  if (!saved) throw new UserError("That product no longer exists.");
  const live = await publishSite(env);
  return json({ product: saved, live });
});

export const onRequestDelete = adminRoute(async ({ request, env }) => {
  const id = slugify(new URL(request.url).searchParams.get("id"));
  if (!id) throw new UserError("Missing product.");
  await db(env, `vv_products?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  const live = await publishSite(env);
  return json({ deleted: id, live });
});
