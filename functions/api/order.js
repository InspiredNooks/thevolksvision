// POST /api/order  - public. Prices are recomputed from the database; the browser's numbers are never trusted.
// With STRIPE_SECRET_KEY set: saves the order as awaiting_payment and returns a Stripe Checkout link.
//   Stripe collects the card, email and shipping address; /api/stripe-webhook marks it paid and sends the emails.
// Without Stripe: records an order request and RJ sends a payment request by hand.
import { json, db, sendEmail } from "../../lib/server.js";
import { getProducts, getSettings } from "../../lib/content.js";
import { createCheckout, itemName } from "../../lib/stripe.js";
import { sendPush } from "../../lib/push.js";

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const firstEmail = s => (String(s).match(/[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[a-z]{2,}/i) || [""])[0].toLowerCase() || null;
export const shippingFor = (subtotal, cfg, pickup) => pickup || (cfg.freeShipOver > 0 && subtotal >= cfg.freeShipOver) ? 0 : Number(cfg.shipping) || 0;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }

  // Honeypot: real buyers never see or fill this field.
  if (body.website) return json({ orderNumber: "VV-0000", total: 0 });

  const stripe = Boolean(env.STRIPE_SECRET_KEY);
  const pickup = stripe ? body.pickup === true : /^\s*pick\s*-?\s*up\s*$/i.test(String(body.buyer?.ship || ""));
  const buyer = { name: clean(body.buyer?.name, 120), contact: clean(body.buyer?.contact, 160), ship: clean(body.buyer?.ship, 300) };
  if (!stripe && (!buyer.name || !buyer.contact || !buyer.ship)) return json({ error: "Name, contact and shipping details are required." }, 400);

  let PRODUCTS, CONFIG;
  try { [PRODUCTS, CONFIG] = await Promise.all([getProducts(env), getSettings(env)]); }
  catch (err) { console.error(err); return json({ error: "The shop is briefly unavailable. Please try again in a minute." }, 502); }

  const items = [];
  for (const it of Array.isArray(body.items) ? body.items.slice(0, 30) : []) {
    const p = PRODUCTS.find(x => x.id === it.id);
    const qty = Math.floor(Number(it.qty));
    if (!p || p.sold_out || !p.sizes.includes(it.size) || !(qty >= 1 && qty <= 20))
      return json({ error: `${p ? p.name : "One of the items"}${p && p.sold_out ? " just sold out" : " is no longer available in that option"}. Remove it from your bag and try again.` }, 400);
    items.push({ id: p.id, name: p.name, size: it.size, qty, price: p.price });
  }
  if (!items.length) return json({ error: "Your bag is empty." }, 400);

  const subtotal = Math.round(items.reduce((a, l) => a + l.qty * l.price, 0) * 100) / 100;
  const shipping = shippingFor(subtotal, CONFIG, pickup);
  const total = subtotal + shipping;
  const orderNumber = "VV-" + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();
  const email = firstEmail(buyer.contact);

  const row = { order_number: orderNumber, items, subtotal, shipping, total,
    customer_name: buyer.name || "(checking out)", customer_contact: buyer.contact || "(checking out)", customer_email: email,
    ship_to: pickup ? "Local pickup" : buyer.ship || "(entered at checkout)", status: stripe ? "awaiting_payment" : "new" };
  try { await db(env, "vv_orders", { method: "POST", body: JSON.stringify(row) }); }
  catch (err) { console.error(err); return json({ error: "We couldn't save your order. Please try again in a minute." }, 502); }

  if (stripe) {
    try {
      const session = await createCheckout(env, { orderNumber, items, shipping, pickup, site: CONFIG.siteUrl, brand: CONFIG.brand });
      // Bookkeeping only: if it fails, the buyer still gets their checkout (the webhook finds the order by number).
      await db(env, `vv_orders?order_number=eq.${orderNumber}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ stripe_session: session.id }) }).catch(err => console.error(err));
      return json({ orderNumber, total, checkoutUrl: session.url });
    } catch (err) {
      console.error(err);
      await db(env, `vv_orders?order_number=eq.${orderNumber}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "cancelled", notes: "Checkout could not start" }) }).catch(() => {});
      return json({ error: "Checkout is briefly unavailable. Please try again in a minute." }, 502);
    }
  }

  const lines = items.map(l => `${l.qty} x ${itemName(l)}  $${(l.qty * l.price).toFixed(2)}`).join("\n");
  await Promise.allSettled([
    sendPush(env, "admin", { title: `🛒 Order request: $${total.toFixed(2)}`, body: `${buyer.name}: send them a payment request.`, url: "/admin", tag: `order-${orderNumber}` }),
    sendEmail(env, { to: (env.ORDER_NOTIFY_EMAIL || "thevolksvision@gmail.com"), subject: `New order request ${orderNumber}: $${total.toFixed(2)}`,
      text: `${buyer.name}\n${buyer.contact}\nShip to: ${buyer.ship}\n\n${lines}\n\nTotal $${total.toFixed(2)}\n\nOpen the Studio: ${CONFIG.siteUrl}/admin` }),
    email && sendEmail(env, { to: email, subject: `${CONFIG.brand} order ${orderNumber} received`,
      text: `Thanks for your order.\n\nRJ will send a payment request (${CONFIG.payWith}) shortly, then ship it out.\n\n${lines}\nShipping $${shipping.toFixed(2)}\nTotal $${total.toFixed(2)}\n\n${CONFIG.brand}\n${CONFIG.siteUrl}` })
  ]);

  return json({ orderNumber, total });
}
