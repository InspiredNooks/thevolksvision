// POST /api/stripe-webhook - Stripe tells us a checkout finished. Signature-checked.
// Paid: marks the order paid, saves the buyer's name, email and address, emails RJ and the buyer.
// Expired (buyer walked away): marks the order cancelled. Each order is handled once.
import { json, db, sendEmail } from "../../lib/server.js";
import { getSettings } from "../../lib/content.js";
import { verifyWebhook } from "../../lib/stripe.js";
import { sendPush } from "../../lib/push.js";

const addr = a => a ? [a.line1, a.line2, `${a.city || ""}, ${a.state || ""} ${a.postal_code || ""}`.trim(), a.country !== "US" ? a.country : ""].filter(Boolean).join(", ") : "";

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  if (!(await verifyWebhook(env, payload, request.headers.get("Stripe-Signature")))) return json({ error: "Bad signature." }, 400);
  const event = JSON.parse(payload);
  const s = event.data?.object || {};
  const orderNumber = s.metadata?.order_number || s.client_reference_id;
  if (!orderNumber || !/^VV-[A-Z0-9]+$/.test(orderNumber)) return json({ ignored: true });

  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    await db(env, `vv_orders?order_number=eq.${orderNumber}&status=eq.awaiting_payment`, { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "cancelled", notes: event.type === "checkout.session.expired" ? "Checkout abandoned" : "Payment failed", updated_at: new Date().toISOString() }) });
    return json({ ok: true });
  }
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) || s.payment_status !== "paid") return json({ ignored: true });

  const ship = s.collected_information?.shipping_details || s.shipping_details;
  const cust = s.customer_details || {};
  const total = (s.amount_total ?? 0) / 100;
  const tax = (s.total_details?.amount_tax ?? 0) / 100;
  const update = {
    status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    customer_name: (ship?.name || cust.name || "Customer").slice(0, 120),
    customer_email: cust.email || null, customer_contact: cust.email || cust.phone || "(Stripe)",
    ...(ship?.address ? { ship_to: `${ship.name ? ship.name + ", " : ""}${addr(ship.address)}`.slice(0, 300) } : {}),
    total, notes: `Paid by card via Stripe${tax ? ` (includes $${tax.toFixed(2)} sales tax)` : ""}.`
  };
  // Only the first delivery of this event flips the order; retries find nothing to update and send no duplicate emails.
  const rows = await db(env, `vv_orders?order_number=eq.${orderNumber}&status=in.(awaiting_payment,cancelled)`, { method: "PATCH", body: JSON.stringify(update) });
  const order = rows?.[0];
  if (!order) return json({ ok: true, duplicate: true });

  const S = await getSettings(env);
  const lines = (order.items || []).map(l => `${l.qty} x ${l.name} (${l.size})  $${(l.qty * l.price).toFixed(2)}`).join("\n");
  const pickup = order.ship_to === "Local pickup";
  await Promise.allSettled([
    sendPush(env, "admin", { title: `💸 New order: $${total.toFixed(2)}`, body: `${update.customer_name} · ${(order.items || []).map(l => `${l.qty}× ${l.name}`).join(", ").slice(0, 100)}${pickup ? " · pickup" : ""}`, url: "/admin", tag: `order-${orderNumber}` }),
    sendEmail(env, { to: env.ORDER_NOTIFY_EMAIL || "thevolksvision@gmail.com", subject: `💸 Paid order ${orderNumber}: $${total.toFixed(2)}`,
      text: `${update.customer_name}\n${update.customer_contact}\n${pickup ? "LOCAL PICKUP: email them to set a time" : `Ship to: ${update.ship_to || order.ship_to}`}\n\n${lines}\nShipping $${Number(order.shipping).toFixed(2)}${tax ? `\nSales tax $${tax.toFixed(2)}` : ""}\nTotal paid $${total.toFixed(2)}\n\nMark it Shipped in the Studio: ${S.siteUrl}/admin` }),
    cust.email && sendEmail(env, { to: cust.email, replyTo: S.orderEmail, subject: `${S.brand} order ${orderNumber}: you're in`,
      text: `Thanks for repping VolksVision.\n\nYour order is paid and RJ is on it. ${pickup ? "He'll email you to set a pickup time in St. Pete." : "You'll get another email when it ships."}\n\n${lines}\nShipping $${Number(order.shipping).toFixed(2)}${tax ? `\nSales tax $${tax.toFixed(2)}` : ""}\nTotal $${total.toFixed(2)}\n\nQuestions? Reply to this email or write ${S.orderEmail}.\n\n${S.brand}\n${S.siteUrl}` })
  ]);
  return json({ ok: true });
}
