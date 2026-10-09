// Background function (the "-background" filename is what makes Netlify run it for up to 15 minutes
// and answer 202 right away). Writes a coaching report; normal requests are cut off much sooner.
// Triggered by /api/admin/coach with RJ's Studio passphrase; the Studio polls for the result.
import { runCoach } from "../../lib/coach.js";
import { isAdmin } from "../../lib/server.js";

export default async (request) => {
  const env = process.env;
  if (!(await isAdmin(request, env))) return;
  try { await runCoach(env); } catch (err) { console.error("coach failed", err); }
};

