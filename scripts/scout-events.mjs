// Twice-a-week event scan (run by .github/workflows/scout.yml): finds car events around Tampa Bay
// from RJ's saved sources and the web. New finds wait for his approval unless "Add automatically" is on.
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional DEPLOY_HOOK_URL
import { scanEvents } from "../lib/scout.js";
import { hasDb } from "../lib/content.js";

const env = process.env;
if (!hasDb(env) || !env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
const added = await scanEvents(env);
console.log(`Found ${added.length} new event(s).`, added.map(e => `${e.starts_at.slice(0, 10)} ${e.title}`).join(" | "));
