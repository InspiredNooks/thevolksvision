// POST /api/admin/publish - rebuild the public site now (the "Refresh the site" button).
import { json, adminRoute, publishSite } from "../../../lib/server.js";

export const onRequestPost = adminRoute(async ({ env }) => json({ live: await publishSite(env) }));
