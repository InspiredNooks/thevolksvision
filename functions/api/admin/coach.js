// /api/admin/coach - weekly AI coaching (Studio → Grow → Stats).
// GET  last 8 reports   POST  write a new report now (needs ANTHROPIC_API_KEY)
import { db, json, adminRoute, UserError } from "../../../lib/server.js";
import { runCoach } from "../../../lib/coach.js";

export const onRequestGet = adminRoute(async ({ env }) => json(await db(env, "vv_coach?select=*&order=created_at.desc&limit=8")));

export const onRequestPost = adminRoute(async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) throw new UserError("The coach isn't switched on yet (ANTHROPIC_API_KEY missing in Cloudflare).");
  const recent = await db(env, `vv_coach?select=id&created_at=gte.${new Date(Date.now() - 6 * 3600e3).toISOString()}`);
  if (recent.length) throw new UserError("You already got coaching in the last few hours. Log more videos and check back later.");
  if (env.PLATFORM === "netlify") {
    // Netlify: run in a background function and let the Studio poll for the new report.
    await fetch(new URL("/api/coach-run", request.url), { method: "POST", headers: { Authorization: request.headers.get("Authorization") } });
    return json({ pending: true }, 202);
  }
  return json(await runCoach(env));
});
