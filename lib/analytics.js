// Social analytics shared by the phone Studio (Grow → Stats) and the weekly coach.
// Plain functions over the video log; no network, no dependencies.
//
// Why these signals: on short-form platforms, shares, saves and follows per view
// say far more about whether people want MORE of you than raw views or likes do.
// Diehard fans show up as comments, shares and follows, so those are weighted highest.

export const PILLARS = ["Build log", "Scene", "Know-how", "Behind VolksVision", "Crew"];
export const HOOKS = ["Engine/sound first", "Bold line on screen", "Before / after", "Question to viewers", "Rate this", "Fail or problem", "Reveal", "Trend / audio", "Other"];
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const n = v => Number(v) || 0;
export function score(v) {
  const views = n(v.views);
  const per1k = x => views ? (n(x) / views) * 1000 : 0;
  const eng = views ? (n(v.likes) + n(v.comments) + n(v.shares) + n(v.saves)) / views : 0;
  return {
    views,
    engagement: eng,                       // share of viewers who did anything
    shares1k: per1k(v.shares),             // spreads to new people
    saves1k: per1k(v.saves),               // worth coming back to
    comments1k: per1k(v.comments),         // conversation = community
    follows1k: per1k(v.follows),           // turned viewers into followers
    // One number to rank videos by "builds diehards", not just reach.
    crew: per1k(v.follows) * 3 + per1k(v.comments) * 2 + per1k(v.shares) * 2 + per1k(v.saves)
  };
}

const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const weekStart = d => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.toISOString().slice(0, 10); };

function groupBy(videos, keyFn) {
  const m = new Map();
  for (const v of videos) { const k = keyFn(v) || "Not set"; if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
  return [...m].map(([key, vs]) => {
    const s = vs.map(score);
    return { key, count: vs.length, views: avg(s.map(x => x.views)), engagement: avg(s.map(x => x.engagement)),
      shares1k: avg(s.map(x => x.shares1k)), follows1k: avg(s.map(x => x.follows1k)), crew: avg(s.map(x => x.crew)) };
  }).sort((a, b) => b.crew - a.crew);
}

// videos: rows from vv_videos. targetPerWeek: RJ's posting goal.
export function analyze(videos, { targetPerWeek = 5, today = new Date().toISOString().slice(0, 10) } = {}) {
  const vids = videos.filter(v => n(v.views) > 0);
  const t = new Date(today + "T12:00:00Z");
  const daysAgo = d => (t - new Date(d + "T12:00:00Z")) / 864e5;
  const last28 = vids.filter(v => daysAgo(v.posted_on) < 28), prev28 = vids.filter(v => daysAgo(v.posted_on) >= 28 && daysAgo(v.posted_on) < 56);

  const weeks = new Map();
  for (const v of videos) { const w = weekStart(v.posted_on); weeks.set(w, (weeks.get(w) || 0) + 1); }
  const weekly = [...weeks].sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([week, posts]) => ({ week, posts }));
  const thisWeek = weeks.get(weekStart(today)) || 0;
  const lastWeek = weeks.get(weekStart(new Date(t - 7 * 864e5).toISOString().slice(0, 10))) || 0;

  const ranked = vids.map(v => ({ ...v, s: score(v) })).sort((a, b) => b.s.crew - a.s.crew);
  const out = {
    total: videos.length, measured: vids.length,
    totals: { views: vids.reduce((a, v) => a + n(v.views), 0), follows: vids.reduce((a, v) => a + n(v.follows), 0), shares: vids.reduce((a, v) => a + n(v.shares), 0), comments: vids.reduce((a, v) => a + n(v.comments), 0) },
    recent: { views: avg(last28.map(v => n(v.views))), prevViews: avg(prev28.map(v => n(v.views))), follows1k: avg(last28.map(v => score(v).follows1k)), prevFollows1k: avg(prev28.map(v => score(v).follows1k)), count: last28.length, prevCount: prev28.length },
    byPillar: groupBy(vids, v => v.pillar), byHook: groupBy(vids, v => v.hook), byPlatform: groupBy(vids, v => v.platform),
    byDay: groupBy(vids, v => DAYS[new Date(v.posted_on + "T12:00:00Z").getUTCDay()]),
    byLength: groupBy(vids.filter(v => n(v.length_sec) > 0), v => n(v.length_sec) <= 15 ? "Under 15s" : n(v.length_sec) <= 30 ? "15-30s" : n(v.length_sec) <= 60 ? "30-60s" : "Over 60s"),
    top: ranked.slice(0, 5), bottom: ranked.length > 8 ? ranked.slice(-3) : [],
    weekly, thisWeek, lastWeek, targetPerWeek
  };
  out.moves = recommend(out);
  return out;
}

// Plain-language adjustments. Each needs enough data to mean something.
function recommend(a) {
  const moves = [];
  const pct = x => `${Math.round(x * 100)}%`;
  if (a.measured < 6) {
    moves.push({ kind: "data", text: `Log at least 6 videos with their numbers. With ${a.measured} so far, any pattern is luck.` });
    if (a.lastWeek < a.targetPerWeek) moves.push({ kind: "consistency", text: `Last week: ${a.lastWeek} of ${a.targetPerWeek} videos. Consistency is the first lever. Batch-film on Monday.` });
    return moves;
  }
  if (a.lastWeek < a.targetPerWeek) moves.push({ kind: "consistency", text: `Last week you posted ${a.lastWeek} of ${a.targetPerWeek}. Before changing anything else, hit the number.` });
  const pillars = a.byPillar.filter(p => p.count >= 2 && p.key !== "Not set");
  if (pillars.length >= 2) {
    const best = pillars[0], worst = pillars[pillars.length - 1];
    if (best.crew > worst.crew * 1.4) moves.push({ kind: "pillar", text: `"${best.key}" videos build your crew best (${best.follows1k.toFixed(1)} follows per 1k views vs ${worst.follows1k.toFixed(1)} for "${worst.key}"). Swap one "${worst.key}" video a week for "${best.key}".` });
  }
  const hooks = a.byHook.filter(h => h.count >= 2 && h.key !== "Not set");
  if (hooks.length >= 2 && hooks[0].views > hooks[hooks.length - 1].views * 1.3) moves.push({ kind: "hook", text: `"${hooks[0].key}" openings get ${Math.round(hooks[0].views / Math.max(1, hooks[hooks.length - 1].views) * 10) / 10}x the views of "${hooks[hooks.length - 1].key}". Lead with it more.` });
  const days = a.byDay.filter(d => d.count >= 2);
  if (days.length >= 3) moves.push({ kind: "timing", text: `${days[0].key} posts are your strongest so far. Put your best video of the week there.` });
  const lengths = a.byLength.filter(l => l.count >= 2);
  if (lengths.length >= 2) moves.push({ kind: "length", text: `${lengths[0].key} videos turn viewers into followers best. Edit toward that length.` });
  const plats = a.byPlatform.filter(p => p.count >= 2);
  if (plats.length >= 2) moves.push({ kind: "platform", text: `${plats[0].key} is converting best right now. Post there first, then cross-post.` });
  if (a.recent.prevCount >= 3 && a.recent.count >= 3) {
    const ch = a.recent.views / Math.max(1, a.recent.prevViews) - 1;
    if (Math.abs(ch) >= 0.2) moves.push({ kind: "trend", text: ch > 0 ? `Average views are up ${pct(ch)} over the last 4 weeks. Keep the format, change the topics.` : `Average views are down ${pct(-ch)} over the last 4 weeks. Re-watch your top 3 and copy their first 2 seconds.` });
  }
  const comments = a.top.filter(v => v.s.comments1k > 0).length;
  if (a.totals.comments > 0 && comments) moves.push({ kind: "community", text: `Reply to your best comments with a video. It's the fastest way to turn a commenter into a diehard.` });
  if (a.top[0]) moves.push({ kind: "repeat", text: `Your top video for building the crew: "${a.top[0].title || a.top[0].url || "untitled"}". Make a part 2.` });
  return moves.slice(0, 6);
}
