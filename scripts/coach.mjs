// Sunday coaching: node scripts/coach.mjs (run by .github/workflows/coach.yml).
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional RESEND_API_KEY, ORDER_NOTIFY_EMAIL, ORDER_FROM_EMAIL, SITE_URL
import { runCoach } from "../lib/coach.js";

const env = process.env;
const saved = await runCoach(env);
const r = saved.report;
console.log(`Coach: ${r.headline}`);
if (env.RESEND_API_KEY && (env.ORDER_NOTIFY_EMAIL || "thevolksvision@gmail.com")) {
  const site = (env.SITE_URL || "https://thevolksvision.com").replace(/\/$/, "");
  await fetch("https://api.resend.com/emails", { method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.ORDER_FROM_EMAIL || "VolksVision <orders@thevolksvision.shop>", to: (env.ORDER_NOTIFY_EMAIL || "thevolksvision@gmail.com"),
      subject: `Your week: ${r.headline}`,
      text: `${r.headline}\n\nWhat worked:\n${r.wins.map(x => "- " + x).join("\n")}\n\nChange next week:\n${r.fixes.map(x => "- " + x).join("\n")}\n\nCrew move: ${r.crew_move}\n\nFull plan and one-tap ideas: ${site}/admin#grow` }) });
}
