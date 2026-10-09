// Writes a coaching report in the background (Netlify cuts normal requests off at 60s).
// Triggered by /api/admin/coach with RJ's Studio passphrase; the Studio polls for the result.
import { runCoach } from "../../lib/coach.js";
import { isAdmin } from "../../lib/server.js";

export default async (request) => {
  const env = process.env;
  if (!(await isAdmin(request, env))) return;
  try { await runCoach(env); } catch (err) { console.error("coach failed", err); }
};

export const config = { background: true, path: "/api/coach-run" };
