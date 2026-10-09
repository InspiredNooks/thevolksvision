// POST /api/order  - public. Records an order request in the CRM and alerts RJ.
// Prices are recomputed from catalog.js; the browser's numbers are never trusted.
import { json, db, sendEmail } from "../../lib/server.js";
import { getProducts, getSettings } from "../../lib/content.js";

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }

  // Honeypot: real buyers never see or fill this field.
  if (body.website) return json({ orderNumber: "VV-0000", total: 0 });

  const buyer = { name: clean(body.buyer?.name, 120), contact: clean(body.buyer?.contact, 160), ship: clean(body.buyer?.ship, 300) };
  if (!buyer.name || !buyer.contact || !buyer.ship) return json({ error: "Name, contact and shipping details are required." }, 400);

  let PRODUCTS, CONFIG;
  try { [PRODUCTS, CONFIG] = await Promise.all([getProducts(env), getSettings(env)]); }
  catch (err) { console.error(err); return json({ error: "The shop is briefly unavailable. Please try again in a minute." }, 502); }

  const items = [];
  for (const it of Array.isArray(body.items) ? body.items.slice(0, 30) : []) {
    const p = PRODUCTS.find(x => x.id === it.id);
    const qty = Math.floor(Number(it.qty));
    if (!p || p.sold_out || !p.sizes.includes(it.size) || !(qty >= 1 && qty <= 20)) return json({ error: "One of the items in your bag is no longer available. Remove it and try again." }, 400);
    items.push({ id: p.id, name: p.name, size: it.size, qty, price: p.price });
  }
  if (!items.length) return json({ error: "Your bag is empty." }, 400);

  const subtotal = items.reduce((a, l) => a + l.qty * l.price, 0);
  const shipping = /^\s*pick\s*-?\s*up\s*$/i.test(buyer.ship) || subtotal >= CONFIG.freeShipOver ? 0 : CONFIG.shipping;
  const total = subtotal + shipping;
  const orderNumber = "VV-" + Date.now().toString(36).toUpperCase().slice(-6);
  const email = /\S+@\S+\.\S+/.test(buyer.contact) ? buyer.contact.toLowerCase() : null;

  try {
    await db(env, "vv_orders", { method: "POST", body: JSON.stringify({
      order_number: orderNumber, customer_name: buyer.name, customer_contact: buyer.contact, customer_email: email,
      ship_to: buyer.ship, items, subtotal, shipping, total, status: "new"
    }) });
  } catch (err) {
    console.error(err);
    return json({ error: "We couldn't save your order. Please try again in a minute." }, 502);
  }

  const lines = items.map(l => `${l.qty} x ${l.name} (${l.size})  $${(l.qty * l.price).toFixed(2)}`).join("\n");
  await Promise.allSettled([
    sendEmail(env, { to: (env.ORDER_NOTIFY_EMAIL || "thevolksvision@gmail.com"), subject: `New order ${orderNumber}: $${total.toFixed(2)}`,
      text: `${buyer.name}\n${buyer.contact}\nShip to: ${buyer.ship}\n\n${lines}\n\nTotal $${total.toFixed(2)}\n\nOpen the CRM: ${CONFIG.siteUrl}/admin` }),
    email && sendEmail(env, { to: email, subject: `${CONFIG.brand} order ${orderNumber} received`,
      text: `Hi ${buyer.name},\n\nThanks for your order. RJ will send a payment request (${CONFIG.payWith}) shortly, then ship it out.\n\n${lines}\nShipping $${shipping.toFixed(2)}\nTotal $${total.toFixed(2)}\n\n${CONFIG.brand}\n${CONFIG.siteUrl}` })
  ]);

  return json({ orderNumber, total });
}
