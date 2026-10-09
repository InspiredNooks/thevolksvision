// POST /api/admin/youtube - pull RJ's latest YouTube videos and their stats into the video log.
// Needs YOUTUBE_API_KEY (Google Cloud, YouTube Data API v3) and the YouTube link in Settings.
// RJ's own tags (pillar, hook, notes) are never overwritten.
import { db, json, adminRoute, UserError } from "../../../lib/server.js";
import { getSettings } from "../../../lib/content.js";

const iso = d => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || ""); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; };

export const onRequestPost = adminRoute(async ({ env }) => {
  if (!env.YOUTUBE_API_KEY) throw new UserError("YouTube sync isn't switched on yet (YOUTUBE_API_KEY missing in Cloudflare).");
  const s = await getSettings(env);
  const m = /youtube\.com\/(@[\w.-]+|channel\/(UC[\w-]+))/.exec(s.youtube || "");
  if (!m) throw new UserError("Add your YouTube channel link in More → Settings first (youtube.com/@yourname).");
  const yt = async (path, q) => {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...q, key: env.YOUTUBE_API_KEY })}`);
    const j = await r.json();
    if (!r.ok) throw new UserError(`YouTube said: ${j.error?.message || r.status}`);
    return j;
  };
  const ch = await yt("channels", { part: "statistics,contentDetails", ...(m[2] ? { id: m[2] } : { forHandle: m[1] }) });
  const channel = ch.items?.[0];
  if (!channel) throw new UserError("Couldn't find that YouTube channel. Check the link in Settings.");
  const list = await yt("playlistItems", { part: "contentDetails", playlistId: channel.contentDetails.relatedPlaylists.uploads, maxResults: "25" });
  const ids = (list.items || []).map(i => i.contentDetails.videoId);
  if (!ids.length) return json({ synced: 0, subscribers: Number(channel.statistics.subscriberCount) || null });
  const vids = await yt("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") });
  const rows = (vids.items || []).map(v => ({
    platform: "YouTube", external_id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, title: v.snippet.title.slice(0, 200),
    posted_on: v.snippet.publishedAt.slice(0, 10), length_sec: iso(v.contentDetails.duration),
    views: +v.statistics.viewCount || 0, likes: +v.statistics.likeCount || 0, comments: +v.statistics.commentCount || 0,
    updated_at: new Date().toISOString()
  }));
  await db(env, "vv_videos?on_conflict=platform,external_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  return json({ synced: rows.length, subscribers: Number(channel.statistics.subscriberCount) || null });
});
