// One place that answers "what's on the site right now?"
// Reads products, posts and settings from Supabase (what RJ edits on his phone).
// When Supabase isn't configured (local preview, first deploy), it falls back to
// catalog.js so the site always builds.
import { CONFIG, PRODUCTS } from "../catalog.js";

export const DEFAULT_SETTINGS = {
  ...CONFIG,
  about: "RJ started VolksVision to document the cars and the people who build them. Every design starts as one of his frames or clips: a VR6 at golden hour on the causeway, a build mid-swap in the garage, a meet lineup in St. Pete.",
  topics: [],
  autoPublish: false,       // weekly posts wait for RJ to approve them (Studio → Journal)
  eventsAuto: false,        // events the scout finds wait for RJ to approve them (Studio → Mk2 → Next stops)
  eventSources: [],         // sites and pages RJ trusts for car events; the scout reads these first
  heroImage: "", heroAlt: "", heroHeadline: "",
  dropName: "Drop 01", dropNote: "Limited run",
  // RJ fills these in from the Studio's Mk2 tab. Nothing about the car is assumed here.
  build: { car: "Mk2 Volkswagen Jetta", headline: "", story: "", specs: [], gallery: [],
    // Project tracker: the Mk2 isn't running yet. RJ ticks stages off from the Studio.
    status: "In the build",
    stages: [{ name: "Teardown", done: false }, { name: "Rust and body", done: false }, { name: "Engine", done: false }, { name: "Wiring", done: false }, { name: "Suspension and wheels", done: false }, { name: "First start", done: false }, { name: "Road legal", done: false }] },
  videos: [],
  // Build partners: shown on the site with sponsored links; RJ edits them in Money → Media kit.
  sponsors: [
    { name: "Inspired Nooks Realty", url: "https://inspirednooks.com", tagline: "Tampa Bay real estate", logo: "", disclosure: "", show: true },
    { name: "Car Guy Mortgage", url: "", tagline: "Home loans from a car guy", logo: "", disclosure: "", show: true }
  ],
  weeklyGoal: 5,
  incomeGoal: 500,
  mediaKit: { showNumbers: true, pitch: "VolksVision is a Gen Z car channel built around a Mk2 Jetta coming back to life in St. Petersburg, FL. The audience builds cars, goes to meets and buys parts.", services: ["Sponsored TikTok / Reel / Short", "Product install + honest review in a build episode", "Meet and event coverage", "Photo and video shoots", "Co-branded merch drop"], partners: [], audience: "Car enthusiasts, mostly 16 to 30, heavy on VW and import fans, centered on Tampa Bay and Florida." },
  ownerName: "RJ Savell Keelin",
  legalName: "",          // e.g. "BayWay Media Co." once the LLC is active on Sunbiz
  ownerTitle: "Owner, Operator & Key Influencer",
  journalName: "The Glovebox",
  listName: "the Pit Crew",
  pillars: ["Build log", "Scene", "Know-how", "Behind VolksVision", "Crew"],
  hooks: ["Engine/sound first", "Bold line on screen", "Before / after", "Question to viewers", "Rate this", "Fail or problem", "Reveal", "Trend / audio", "Other"],
  // Every line of site copy RJ can rewrite from the Studio (More → Site text).
  text: {
    heroSub: "RJ is bringing a Mk2 Jetta back to life in St. Pete, one episode at a time. Follow the build. Wear the work.",
    shopTitle: "The merch",
    carIntro: "The car behind VolksVision. It's not running yet. Every stage of bringing it back goes in the build log.",
    storyEyebrow: "Who's behind the lens",
    storyHeadline: "RJ. St. Pete. Six-speed opinions.",
    alertsHeadline: "Join the Pit Crew.",
    alertsBody: "First dibs on drops, new Glovebox posts and Mk2 updates. No spam, unsubscribe anytime.",
    crewHeadline: "The Crew",
    crewIntro: "Your car, featured on VolksVision. Send it in. One gets picked as Crew car of the week.",
    workIntro: "VolksVision makes VW and car culture content for an audience that actually builds cars. Let's make something good."
  }
};

// Works with the legacy service_role JWT and the newer sb_secret_ keys (which must not go in Authorization).
export const supaAuth = env => { const k = env.SUPABASE_SERVICE_ROLE_KEY; return k.startsWith("eyJ") ? { apikey: k, Authorization: `Bearer ${k}` } : { apikey: k }; };

export async function supa(env, pathAndQuery, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      ...supaAuth(env),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Database error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export const hasDb = env => Boolean(env && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

export async function getSettings(env) {
  if (!hasDb(env)) return { ...DEFAULT_SETTINGS };
  const rows = await supa(env, "vv_settings?id=eq.1&select=data");
  const data = rows[0]?.data || {};
  const s = { ...DEFAULT_SETTINGS, ...data, text: { ...DEFAULT_SETTINGS.text, ...(data.text || {}) },
    build: { ...DEFAULT_SETTINGS.build, ...(data.build || {}) }, mediaKit: { ...DEFAULT_SETTINGS.mediaKit, ...(data.mediaKit || {}) } };
  if (!s.build.stages?.length) s.build.stages = DEFAULT_SETTINGS.build.stages;
  return { ...s, shipping: Number(s.shipping) || 0, freeShipOver: Number(s.freeShipOver) || 0 };
}

const normalizeProduct = p => ({
  ...p,
  price: Number(p.price),
  sizes: Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["One size"],
  active: p.active !== false,
  sold_out: p.sold_out === true,
  archived: p.archived === true,
  images: Array.isArray(p.images) ? p.images.filter(x => x && x.url) : [],
  details: p.details || "",
  image_alt: p.image_alt || p.name
});

export async function getProducts(env, { includeHidden = false } = {}) {
  if (!hasDb(env)) return PRODUCTS.map((p, i) => normalizeProduct({ ...p, sort: i }));
  const rows = await supa(env, `vv_products?select=*&order=sort.asc,name.asc${includeHidden ? "" : "&active=eq.true&archived=eq.false"}`);
  return rows.map(normalizeProduct);
}

export async function getPosts(env, { includeDrafts = false } = {}) {
  if (!hasDb(env)) return [];
  return supa(env, `vv_posts?select=*&order=date.desc,id.desc${includeDrafts ? "" : "&status=eq.published"}`);
}
