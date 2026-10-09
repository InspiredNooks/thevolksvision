// POST /api/admin/ask {question, screen} - RJ asks how to do something in the Studio.
// Answers come only from the Studio's own guide (lib/studio-guide.js), as short steps,
// with the screen to open. Without ANTHROPIC_API_KEY the Studio falls back to searching the guide.
import Anthropic from "@anthropic-ai/sdk";
import { json, adminRoute, str, UserError } from "../../../lib/server.js";
import { HELP, FAQ } from "../../../lib/studio-guide.js";

const SCREENS = [...Object.keys(HELP), "none"];
const GUIDE = [
  ...Object.entries(HELP).map(([k, [title, steps]]) => `[screen: ${k}] ${title}\n- ${steps.join("\n- ")}`),
  "Common questions:",
  ...FAQ.map(([q, a, k]) => `Q: ${q}\nA: ${a}${k ? ` [screen: ${k}]` : ""}`)
].join("\n\n");

const SYSTEM = `You are the built-in helper inside VolksVision Studio, the phone app RJ (20, a car creator in St. Pete, FL) uses to run his website, merch shop, sponsorships and content.
Answer his question about how to do something in the Studio using ONLY the guide below. Talk like a helpful friend: short, plain, no corporate tone, no emojis overload.
- Give 1 to 5 short steps, each starting with what to tap. Name tabs and buttons exactly as the guide does (Grow, Money, Shop, Journal, Mk2, More).
- Set "screen" to the one screen that answers it, or "none".
- If the guide doesn't cover it, say so in one line and suggest asking Cara. Never invent buttons or features.
- For anything about money, taxes, contracts or legal stuff beyond using the app, say to check with Cara.

GUIDE:
${GUIDE}`;

const SCHEMA = { type: "object", additionalProperties: false, required: ["answer", "steps", "screen"],
  properties: {
    answer: { type: "string", description: "One or two plain sentences." },
    steps: { type: "array", items: { type: "string" }, description: "0 to 5 short steps." },
    screen: { type: "string", enum: SCREENS }
  } };

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  const question = str(b.question, 500);
  if (question.length < 3) throw new UserError("Type your question first.");
  if (!env.ANTHROPIC_API_KEY) return json({ offline: true });
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5", max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `I'm on: ${str(b.screen, 40) || "unknown"}\nQuestion: ${question}` }]
  });
  if (res.stop_reason === "refusal") throw new UserError("I can't help with that one. Ask Cara.");
  if (res.stop_reason === "max_tokens") throw new UserError("That answer ran long. Try asking it a simpler way.");
  const out = JSON.parse(res.content.filter(c => c.type === "text").map(c => c.text).join(""));
  return json({ answer: out.answer, steps: (out.steps || []).slice(0, 5), screen: SCREENS.includes(out.screen) ? out.screen : "none" });
});
