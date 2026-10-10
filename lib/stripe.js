// Stripe Checkout over plain fetch (no SDK, so it runs on Netlify or Cloudflare unchanged).
// Env: STRIPE_SECRET_KEY (sk_live_... / sk_test_...), STRIPE_WEBHOOK_SECRET (whsec_...),
//      STRIPE_AUTOMATIC_TAX=1 to let Stripe Tax add Florida sales tax (turn on Stripe Tax first).

const form = (obj, prefix = "", out = new URLSearchParams()) => {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out); else out.append(key, String(v));
  }
  return out;
};

async function stripe(env, path, params, idempotencyKey) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: form(params)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message || "error"}`);
  return data;
}

// "One size" items read as just the product name on receipts and statements.
export const itemName = l => /^one size$/i.test(String(l.size || "").trim()) ? l.name : `${l.name} (${l.size})`;

export function createCheckout(env, { orderNumber, items, shipping, pickup, site, brand }) {
  const cents = n => Math.round(Number(n) * 100);
  return stripe(env, "checkout/sessions", {
    mode: "payment",
    client_reference_id: orderNumber,
    metadata: { order_number: orderNumber },
    payment_intent_data: { metadata: { order_number: orderNumber }, description: `${brand} order ${orderNumber}` },
    success_url: `${site}/thanks/?order=${orderNumber}`,
    cancel_url: `${site}/?checkout=cancelled#shop`,
    line_items: Object.fromEntries(items.map((l, i) => [i, {
      quantity: l.qty,
      price_data: { currency: "usd", unit_amount: cents(l.price), product_data: { name: itemName(l), metadata: { product: l.id, size: l.size } } }
    }])),
    ...(pickup
      ? { custom_text: { submit: { message: "Local pickup in St. Petersburg. RJ will email you to set a time." } } }
      : { shipping_address_collection: { allowed_countries: { 0: "US" } },
          shipping_options: { 0: { shipping_rate_data: { type: "fixed_amount", display_name: shipping ? "Standard shipping" : "Free shipping",
            fixed_amount: { amount: cents(shipping), currency: "usd" } } } } }),
    phone_number_collection: { enabled: "false" },
    ...(env.STRIPE_AUTOMATIC_TAX === "1" ? { automatic_tax: { enabled: "true" } } : {})
  }, `checkout-${orderNumber}`);
}

// Verifies the Stripe-Signature header (HMAC-SHA256 of "t.payload"), 5-minute tolerance.
export async function verifyWebhook(env, payload, header) {
  if (!env.STRIPE_WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")).filter(p => p.length === 2).map(([k, v]) => [k, v]));
  const sigs = header.split(",").filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  const hex = [...mac].map(b => b.toString(16).padStart(2, "0")).join("");
  return sigs.some(s => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}
