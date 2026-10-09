// /api/admin/settings - shop-wide settings RJ can change from his phone.
// GET   current settings   PUT {...}   save (only the fields below are accepted)
import { db, json, adminRoute, publishSite, str, UserError } from "../../../lib/server.js";
import { getSettings } from "../../../lib/content.js";

const url = (v, label) => {
  const s = str(v, 300);
  if (s && !/^https:\/\//.test(s)) throw new UserError(`${label} must start with https://`);
  return s;
};
const TEXT_LIMITS = { heroSub: 220, shopTitle: 40, carIntro: 220, storyEyebrow: 40, storyHeadline: 80, alertsHeadline: 60, alertsBody: 220, crewHeadline: 40, crewIntro: 260, workIntro: 300 };
const list = (v, maxItems, maxLen, fallback) => { const xs = (Array.isArray(v) ? v : []).map(x => str(x, maxLen)).filter(Boolean); return [...new Set(xs)].slice(0, maxItems).length ? [...new Set(xs)].slice(0, maxItems) : fallback; };
const photo = v => { const s = str(v, 500); return /^https:\/\//.test(s) || s.startsWith("/") ? s : ""; };
const money = (v, label) => {
  const n = Math.round(Number(v) * 100) / 100;
  if (!(n >= 0 && n < 1000)) throw new UserError(`${label} must be a number.`);
  return n;
};

export const onRequestGet = adminRoute(async ({ env }) => json(await getSettings(env)));

export const onRequestPut = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  const data = {
    tagline: str(b.tagline, 120),
    about: str(b.about, 3000),
    orderEmail: str(b.orderEmail, 160),
    contactEmail: str(b.contactEmail, 160),
    payWith: str(b.payWith, 160),
    instagram: url(b.instagram, "Instagram link"),
    tiktok: url(b.tiktok, "TikTok link"),
    youtube: url(b.youtube, "YouTube link"),
    shipping: money(b.shipping, "Shipping"),
    freeShipOver: money(b.freeShipOver, "Free shipping amount"),
    autoPublish: b.autoPublish !== false,
    heroImage: photo(b.heroImage), heroAlt: str(b.heroAlt, 160),
    heroHeadline: str(b.heroHeadline, 80),
    dropName: str(b.dropName, 40), dropNote: str(b.dropNote, 60),
    build: {
      car: str(b.build?.car, 80),
      headline: str(b.build?.headline, 120),
      story: str(b.build?.story, 12000),
      specs: (Array.isArray(b.build?.specs) ? b.build.specs : []).slice(0, 40)
        .map(x => ({ label: str(x.label, 40), value: str(x.value, 160), link: /^https:\/\//.test(str(x.link, 400)) ? str(x.link, 400) : "" })).filter(x => x.label && x.value),
      status: str(b.build?.status, 40) || "In the build",
      stages: (Array.isArray(b.build?.stages) ? b.build.stages : []).slice(0, 16).map(x => ({ name: str(x.name, 50), done: x.done === true })).filter(x => x.name),
      gallery: (Array.isArray(b.build?.gallery) ? b.build.gallery : []).slice(0, 40)
        .map(x => ({ url: photo(x.url), alt: str(x.alt, 160) })).filter(x => x.url)
    },
    videos: (Array.isArray(b.videos) ? b.videos : []).slice(0, 12).map(v => url(v, "Video link"))
      .filter(v => /^https:\/\/(www\.|m\.|vm\.)?(tiktok\.com|youtube\.com|youtu\.be|instagram\.com)\//.test(v)),
    ownerName: str(b.ownerName, 80) || "RJ Savell Keelin",
    legalName: str(b.legalName, 120),
    ownerTitle: str(b.ownerTitle, 80) || "Owner, Operator & Key Influencer",
    incomeGoal: Math.min(1e6, Math.max(0, Math.round(Number(b.incomeGoal)) || 0)),
    mediaKit: { showNumbers: b.mediaKit?.showNumbers !== false, pitch: str(b.mediaKit?.pitch, 1200), audience: str(b.mediaKit?.audience, 600),
      services: list(b.mediaKit?.services, 12, 120, []), partners: list(b.mediaKit?.partners, 30, 80, []) },
    sponsors: (Array.isArray(b.sponsors) ? b.sponsors : []).slice(0, 12).map(x => ({ name: str(x.name, 80), url: /^https:\/\//.test(str(x.url, 300)) ? str(x.url, 300) : "",
      tagline: str(x.tagline, 120), logo: photo(x.logo), disclosure: str(x.disclosure, 300), show: x.show !== false })).filter(x => x.name),
    weeklyGoal: Math.min(21, Math.max(1, Math.round(Number(b.weeklyGoal)) || 5)),
    journalName: str(b.journalName, 40) || "The Glovebox",
    listName: str(b.listName, 40) || "the Pit Crew",
    pillars: list(b.pillars, 8, 30, ["Build log", "Scene", "Know-how", "Behind VolksVision", "Crew"]),
    hooks: list(b.hooks, 14, 30, ["Engine/sound first", "Bold line on screen", "Before / after", "Question to viewers", "Rate this", "Other"]),
    text: Object.fromEntries(Object.entries(TEXT_LIMITS).map(([k, max]) => [k, str(b.text?.[k], max)]).filter(([, v]) => v)),
    topics: (Array.isArray(b.topics) ? b.topics : []).slice(0, 100).map(t => ({
      title: str(t.title, 120), keyword: str(t.keyword, 120), angle: str(t.angle, 400)
    })).filter(t => t.title)
  };
  await db(env, "vv_settings?id=eq.1", { method: "PATCH", body: JSON.stringify({ data }) });
  const live = await publishSite(env);
  return json({ settings: data, live });
});
