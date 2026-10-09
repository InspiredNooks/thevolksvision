// Netlify entry point for every /api/* route. The handlers in functions/api/ are written
// in the web-standard ({ request, env }) => Response shape, so they run unchanged on
// Netlify (here) or Cloudflare Pages (functions/ directory).
import * as order from "../../functions/api/order.js";
import * as subscribe from "../../functions/api/subscribe.js";
import * as unsubscribe from "../../functions/api/unsubscribe.js";
import * as inquiry from "../../functions/api/inquiry.js";
import * as crew from "../../functions/api/crew.js";
import * as pullup from "../../functions/api/pullup.js";
import * as stripeWebhook from "../../functions/api/stripe-webhook.js";
import * as aAsk from "../../functions/api/admin/ask.js";
import * as aAudience from "../../functions/api/admin/audience.js";
import * as aBroadcast from "../../functions/api/admin/broadcast.js";
import * as aCaptions from "../../functions/api/admin/captions.js";
import * as aCoach from "../../functions/api/admin/coach.js";
import * as aCrew from "../../functions/api/admin/crew.js";
import * as aEvents from "../../functions/api/admin/events.js";
import * as aMoney from "../../functions/api/admin/money.js";
import * as aOrders from "../../functions/api/admin/orders.js";
import * as aPlan from "../../functions/api/admin/plan.js";
import * as aPosts from "../../functions/api/admin/posts.js";
import * as aProducts from "../../functions/api/admin/products.js";
import * as aPublish from "../../functions/api/admin/publish.js";
import * as aSettings from "../../functions/api/admin/settings.js";
import * as aUpload from "../../functions/api/admin/upload.js";
import * as aVideos from "../../functions/api/admin/videos.js";
import * as aYoutube from "../../functions/api/admin/youtube.js";

const ROUTES = {
  order, subscribe, unsubscribe, inquiry, crew, pullup, "stripe-webhook": stripeWebhook,
  "admin/ask": aAsk, "admin/audience": aAudience, "admin/broadcast": aBroadcast, "admin/captions": aCaptions, "admin/coach": aCoach,
  "admin/crew": aCrew, "admin/events": aEvents, "admin/money": aMoney, "admin/orders": aOrders, "admin/plan": aPlan,
  "admin/posts": aPosts, "admin/products": aProducts, "admin/publish": aPublish, "admin/settings": aSettings,
  "admin/upload": aUpload, "admin/videos": aVideos, "admin/youtube": aYoutube
};

export default async (request, context) => {
  const path = new URL(request.url).pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
  const mod = ROUTES[path];
  if (!mod) return Response.json({ error: "Not found." }, { status: 404 });
  const m = request.method.toUpperCase();
  const handler = mod[`onRequest${m[0]}${m.slice(1).toLowerCase()}`] || mod.onRequest;
  if (!handler) return Response.json({ error: "Method not allowed." }, { status: 405 });
  const env = { ...process.env, PLATFORM: "netlify" };
  try { return await handler({ request, env, params: {}, waitUntil: p => context.waitUntil?.(p) }); }
  catch (err) { console.error(err); return Response.json({ error: "Something went wrong. Try again." }, { status: 500 }); }
};

export const config = { path: "/api/*", rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ["ip", "domain"] } };
