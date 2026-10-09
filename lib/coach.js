// Weekly coach: reads RJ's numbers, asks Claude what to adjust, saves a report.
// Runs from the Studio (Grow → Stats → "Get this week's coaching") and every Sunday
// from GitHub Actions (scripts/coach.mjs). Works in Netlify Functions and Node.
import Anthropic from "@anthropic-ai/sdk";
import { supa, getSettings } from "./content.js";
import { analyze } from "./analytics.js";
import { PLAYBOOK } from "./playbook.js";

const SYSTEM = `You are the growth coach for RJ, a 20-year-old car content creator in St. Petersburg, Florida (@thevolksvision on TikTok and Instagram). His brand, VolksVision, centers on his Mk2 Volkswagen Jetta and the Gen Z car scene. He sells his own shirts and merch.

Your job each week: read his real numbers and tell him exactly what to adjust next week so he builds diehard followers (people who comment, share, show up to meets, buy the merch), not just views.

How to talk to him: like a sharp friend a few years older who's into cars. Direct, specific, encouraging, a little funny. Short sentences. No corporate words, no "leverage", no "synergy", no emoji spam (one is fine if it lands). Never talk down to him.

Rules:
- Base every claim on the numbers given. If the data is thin, say so and keep advice to fundamentals.
- Weigh follows, comments, shares and saves per 1,000 views above raw views. Those build a crew.
- Prioritize community moves Gen Z car fans respond to: recurring series with episode numbers, replying to comments with videos, stitches and duets with other car creators, featuring followers' cars (Crew car of the week), meet invites, polls that let followers decide what happens to the Mk2, behind-the-scenes honesty, inside jokes.
- Never suggest street racing, takeovers, reckless driving, or anything illegal or unsafe on camera. Never suggest buying followers, engagement pods, or fake giveaways.
- Ideas must be filmable by one person with a phone in a week, around his Mk2 and the Tampa Bay scene. Don't invent facts about his car beyond what's given.`;

const schemaFor = PILLARS => ({
  type: "object", additionalProperties: false,
  required: ["headline", "verdict", "wins", "fixes", "next_week", "new_ideas", "mix", "crew_move"],
  properties: {
    headline: { type: "string", description: "One punchy line summing up his week, under 90 characters" },
    verdict: { type: "string", enum: ["growing", "steady", "slipping", "not enough data"] },
    wins: { type: "array", items: { type: "string" }, description: "2-3 specific things that worked, citing numbers" },
    fixes: { type: "array", items: { type: "string" }, description: "2-3 specific adjustments for next week" },
    next_week: { type: "array", description: "A 5-video plan for next week", items: { type: "object", additionalProperties: false, required: ["day", "pillar", "idea", "hook"],
      properties: { day: { type: "string", enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] }, pillar: { type: "string", enum: PILLARS }, idea: { type: "string" }, hook: { type: "string", description: "The first line or first shot" } } } },
    new_ideas: { type: "array", description: "4-6 fresh video ideas based on what's working", items: { type: "object", additionalProperties: false, required: ["title", "pillar", "platform"],
      properties: { title: { type: "string" }, pillar: { type: "string", enum: PILLARS }, platform: { type: "string", enum: ["TikTok", "Instagram", "YouTube"] } } } },
    mix: { type: "object", description: "Suggested share of next week's videos per pillar, whole percents summing to 100", additionalProperties: false,
      required: PILLARS, properties: Object.fromEntries(PILLARS.map(p => [p, { type: "integer" }])) },
    crew_move: { type: "string", description: "One specific community-building action for this week" }
  }
});

const buildState = s => { const st = s.build?.stages || [], done = st.filter(x => x.done).map(x => x.name), next = st.find(x => !x.done); return `The Mk2 build: status "${s.build?.status || "In the build"}". Stages done: ${done.join(", ") || "none yet"}. Next stage: ${next ? next.name : "all done"}. Unless the status says it runs, the car is NOT running: never suggest driving it, rolling shots, or taking it to a meet; it can be trailered, pushed or shown parked. Treat the first start as the season-finale moment to build hype toward.`; };

export async function gatherCoachData(env) {
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const [settings, videos, metrics, subs, orders, crew] = await Promise.all([
    getSettings(env),
    supa(env, `vv_videos?select=*&posted_on=gte.${since}&order=posted_on.desc`),
    supa(env, "vv_plan?select=data&kind=eq.metric&order=title.desc&limit=12"),
    supa(env, "vv_subscribers?select=created_at&order=created_at.desc&limit=5000"),
    supa(env, `vv_orders?select=total,created_at,status&created_at=gte.${since}`),
    supa(env, "vv_crew?select=status,created_at&limit=500")
  ]);
  return { settings, videos, metrics: metrics.map(m => m.data), subs, orders, crew };
}

export function coachPrompt({ settings, videos, metrics, subs, orders, crew }) {
  const a = analyze(videos, { targetPerWeek: Number(settings.weeklyGoal) || 5 });
  const round = x => Math.round(x * 10) / 10;
  const table = rows => rows.map(r => `- ${r.key}: ${r.count} videos, avg ${Math.round(r.views)} views, ${round(r.follows1k)} follows/1k, ${round(r.shares1k)} shares/1k, ${Math.round(r.engagement * 1000) / 10}% engagement`).join("\n") || "- (no data)";
  const vid = v => `- [${v.platform}, ${v.posted_on}, ${v.pillar || "no pillar"}, hook: ${v.hook || "?"}${v.length_sec ? `, ${v.length_sec}s` : ""}] "${v.title || v.url || "untitled"}": ${v.views} views, ${v.likes} likes, ${v.comments} comments, ${v.shares} shares, ${v.saves} saves, ${v.follows} follows`;
  const weekAgo = Date.now() - 7 * 864e5;
  return `Today is ${new Date().toISOString().slice(0, 10)}.
${buildState(settings)}
Sponsors / build partners: ${(settings.sponsors || []).map(x => x.name).join(", ") || "none yet"}. Sponsored videos must carry #ad (or the paid-partnership label) and the sponsor's disclosure line; when a sponsor is a family business, he should say so on camera or in the caption.

ACCOUNT NUMBERS (weekly log, newest first):
${metrics.map(m => `- ${m.date}: TikTok ${m.tiktok ?? "?"}, Instagram ${m.instagram ?? "?"}, YouTube ${m.youtube ?? "?"}, videos posted ${m.posts ?? "?"}, merch sold ${m.sales ?? "?"}`).join("\n") || "- none logged yet"}

VIDEOS LOGGED (last 90 days): ${a.total} total, ${a.measured} with numbers. Posted this week: ${a.thisWeek}, last week: ${a.lastWeek} (goal ${a.targetPerWeek}/week).
Last 4 weeks vs the 4 before: avg views ${Math.round(a.recent.views)} vs ${Math.round(a.recent.prevViews)}, follows/1k ${round(a.recent.follows1k)} vs ${round(a.recent.prevFollows1k)}.

BY PILLAR:
${table(a.byPillar)}
BY HOOK:
${table(a.byHook)}
BY PLATFORM:
${table(a.byPlatform)}
BY DAY POSTED:
${table(a.byDay)}
BY LENGTH:
${table(a.byLength)}

TOP VIDEOS FOR BUILDING THE CREW:
${a.top.map(vid).join("\n") || "- none"}
WEAKEST:
${a.bottom.map(vid).join("\n") || "- none"}

COMMUNITY: ${subs.length} people on the Pit Crew email list (${subs.filter(s => new Date(s.created_at) > weekAgo).length} new this week). ${crew.length} Crew car submissions (${crew.filter(c => c.status === "pending").length} waiting for review). ${orders.filter(o => o.status !== "cancelled").length} merch orders in 90 days.

His content pillars: ${settings.pillars.join(", ")}. Opening (hook) types he tracks: ${settings.hooks.join(", ")}.

Write this week's coaching.`;
}

export async function runCoach(env) {
  const data = await gatherCoachData(env);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM + "\n\n" + PLAYBOOK }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: schemaFor(data.settings.pillars) } },
    messages: [{ role: "user", content: coachPrompt(data) }]
  });
  if (response.stop_reason === "refusal") throw new Error("The coach couldn't write a report this time. Try again later.");
  if (response.stop_reason === "max_tokens") throw new Error("The coach's report was cut off. Try again.");
  const report = JSON.parse(response.content.filter(b => b.type === "text").map(b => b.text).join(""));
  const [saved] = await supa(env, "vv_coach", { method: "POST", body: JSON.stringify({ report }) });
  return saved;
}
