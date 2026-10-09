// Static site build: node build.mjs  ->  public/
// Pulls products, posts and settings from Supabase (what RJ edits on his phone).
// Without Supabase env vars it falls back to catalog.js and content/posts/*.md.
// Cloudflare Pages runs this on every deploy, including the rebuilds the admin triggers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSettings, getProducts, getPosts, hasDb, supa } from "./lib/content.js";
import { markdown, wordCount, plainText } from "./lib/markdown.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "public");
const env = process.env;
const read = p => fs.readFileSync(path.join(here, p), "utf8");
const write = (p, s) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = n => "$" + Number(n).toFixed(2);
const CSS = read("templates/site.css");

// ---------- content ----------
const S = await getSettings(env);
const SITE = (env.SITE_URL || S.siteUrl).replace(/\/$/, "");
const PRODUCTS = await getProducts(env);
const today = new Date().toISOString().slice(0, 10);
const posts = (hasDb(env) ? await getPosts(env) : filePosts())
  .filter(p => p.date <= today)                       // future-dated posts wait for their day
  .map(p => ({ ...p, tags: String(p.tags || "").split(",").map(t => t.trim()).filter(Boolean), html: markdown(p.body, SITE), minutes: Math.max(2, Math.round(wordCount(p.body) / 220)) }))
  .sort((a, b) => b.date.localeCompare(a.date));

// Video cards: title + thumbnail from each platform's public oEmbed endpoint (no API keys).
async function oembed(url) {
  const endpoint = /tiktok\.com/.test(url) ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    : /youtu\.?be/.test(url) ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}` : null;
  const platform = /tiktok/.test(url) ? "TikTok" : /youtu/.test(url) ? "YouTube" : "Instagram";
  if (!endpoint) return { url, platform, title: "" };
  try {
    const ctrl = AbortSignal.timeout(6000);
    const r = await fetch(endpoint, { signal: ctrl });
    const j = r.ok ? await r.json() : {};
    return { url, platform, title: j.title || "", thumb: j.thumbnail_url || "" };
  } catch { return { url, platform, title: "" }; }
}
const VIDEOS = await Promise.all((S.videos || []).slice(0, 6).map(oembed));
const BUILD = S.build || {};
const JN = S.journalName || "The Glovebox", T = S.text, LIST = S.listName || "the Pit Crew";
const CREW = hasDb(env) ? await supa(env, "vv_crew?select=id,name,handle,car,story,photo,featured,created_at&status=eq.approved&order=featured.desc,created_at.desc&limit=60") : [];
const FEATURED = CREW.find(c => c.featured);
const NOW = new Date().toISOString();
const EVENTS = hasDb(env) ? await supa(env, "vv_events?select=*&published=eq.true&order=starts_at.asc&limit=100") : [];
const UPCOMING = EVENTS.filter(e => (e.ends_at || e.starts_at) >= NOW), PAST = EVENTS.filter(e => (e.ends_at || e.starts_at) < NOW).reverse().slice(0, 12);
const NEXT = UPCOMING[0];
const STAGES = BUILD.stages || [], STAGES_DONE = STAGES.filter(x => x.done).length;
// Media kit numbers: latest weekly log + last 30 days of logged videos.
const KIT = await (async () => {
  if (!hasDb(env)) return null;
  const [m] = await supa(env, "vv_plan?select=data&kind=eq.metric&order=title.desc&limit=1");
  const vids = await supa(env, `vv_videos?select=views,likes,comments,shares,saves&posted_on=gte.${new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)}`);
  const withViews = vids.filter(v => v.views > 0), views = withViews.reduce((a, v) => a + v.views, 0);
  return { followers: m?.data || {}, avgViews: withViews.length ? Math.round(views / withViews.length) : null,
    engagement: views ? (withViews.reduce((a, v) => a + v.likes + v.comments + v.shares + v.saves, 0) / views) : null, videos: withViews.length };
})();

function filePosts() {
  const dir = path.join(here, "content/posts");
  return fs.readdirSync(dir).filter(f => f.endsWith(".md")).map(f => {
    const m = fs.readFileSync(path.join(dir, f), "utf8").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const meta = {};
    for (const l of m[1].split("\n")) { const i = l.indexOf(":"); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1"); }
    return { ...meta, slug: f.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, ""), body: m[2], status: meta.draft === "true" ? "draft" : "published" };
  }).filter(p => p.status === "published");
}

// ---------- product artwork (until RJ adds a photo) ----------
const INK = "var(--fg,#eef0ec)", PAPER = "var(--panel,#131715)", AMBER = "#f2a93b";
const ART = {
  tee: `<path d="M38 18l-22 12 8 18 10-5v59h52V43l10 5 8-18-22-12q-10 8-22 8T38 18z" fill="${PAPER}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="60" cy="52" r="10" fill="none" stroke="${INK}" stroke-width="2.5"/><circle cx="60" cy="52" r="3.5" fill="${AMBER}"/>`,
  hoodie: `<path d="M42 20q18-10 36 0l24 14-8 20-8-4v56H34V50l-8 4-8-20z" fill="${PAPER}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M46 22q14 18 28 0M52 30v16M68 30v16M40 84h40" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><rect x="44" y="60" width="32" height="16" rx="3" fill="${AMBER}"/>`,
  cap: `<path d="M24 74q0-40 36-40t36 40z" fill="${PAPER}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 74q30 6 72 0q10 2 16 10-40 6-88-10z" fill="${PAPER}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="60" cy="58" r="8" fill="none" stroke="${INK}" stroke-width="2.5"/><circle cx="60" cy="58" r="3" fill="${AMBER}"/>`,
  sticker: `<circle cx="50" cy="56" r="30" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><circle cx="50" cy="56" r="14" fill="none" stroke="${INK}" stroke-width="2.5"/><circle cx="50" cy="56" r="5" fill="${AMBER}"/><rect x="66" y="62" width="34" height="24" rx="4" transform="rotate(12 83 74)" fill="${AMBER}" stroke="${INK}" stroke-width="2.5"/>`,
  key: `<circle cx="40" cy="36" r="12" fill="none" stroke="${INK}" stroke-width="2.5"/><path d="M48 44l12 14" stroke="${INK}" stroke-width="2.5"/><rect x="52" y="54" width="30" height="50" rx="4" transform="rotate(-20 67 79)" fill="${AMBER}" stroke="${INK}" stroke-width="2.5"/>`,
  print: `<rect x="18" y="22" width="84" height="76" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><rect x="28" y="32" width="64" height="44" fill="${AMBER}" opacity=".85"/><path d="M28 76l18-14 12 8 14-12 20 18z" fill="#5d6b65"/><circle cx="78" cy="44" r="6" fill="#fff"/><path d="M30 88h40" stroke="#5b6964" stroke-width="2"/>`
};
const abs = u => !u ? "" : /^https?:/.test(u) ? u : SITE + u;
const productImage = p => p.image ? abs(p.image) : `${SITE}/img/${ART[p.art] ? p.art : "tee"}.svg`;
const visual = (p, eager = false) => p.image
  ? `<img src="${esc(p.image)}" alt="${esc(p.image_alt || p.name)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="900" height="900">`
  : `<svg viewBox="0 0 120 120" role="img" aria-label="${esc(p.name)}">${ART[p.art] || ART.tee}</svg>`;

// ---------- layout ----------
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&family=IBM+Plex+Mono:wght@400;500&display=swap">`;
const MARK = `<svg aria-hidden="true" viewBox="0 0 40 40"><defs><mask id="vvw"><rect width="40" height="40" fill="#fff"/><g fill="#000"><path transform="rotate(45 20 20)" d="M17.1 9.2A2.9 2.9 0 0 1 22.9 9.2Q22.9 11.4 20 14.8Q17.1 11.4 17.1 9.2Z"/><path transform="rotate(135 20 20)" d="M17.1 9.2A2.9 2.9 0 0 1 22.9 9.2Q22.9 11.4 20 14.8Q17.1 11.4 17.1 9.2Z"/><path transform="rotate(225 20 20)" d="M17.1 9.2A2.9 2.9 0 0 1 22.9 9.2Q22.9 11.4 20 14.8Q17.1 11.4 17.1 9.2Z"/><path transform="rotate(315 20 20)" d="M17.1 9.2A2.9 2.9 0 0 1 22.9 9.2Q22.9 11.4 20 14.8Q17.1 11.4 17.1 9.2Z"/><circle transform="rotate(0 20 20)" cx="20" cy="14.4" r="1"/><circle transform="rotate(90 20 20)" cx="20" cy="14.4" r="1"/><circle transform="rotate(180 20 20)" cx="20" cy="14.4" r="1"/><circle transform="rotate(270 20 20)" cx="20" cy="14.4" r="1"/><circle cx="20" cy="20" r="4.3"/></g></mask></defs><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="20" cy="20" r="14.2" fill="currentColor" mask="url(#vvw)"/><circle cx="20" cy="20" r="3.4" fill="var(--accent)"/></svg>`;   // classic teardrop-style wheel, 4x100 like the Mk2
const SOCIAL = [["Instagram", S.instagram], ["TikTok", S.tiktok], ["YouTube", S.youtube]].filter(([, u]) => u);

const ORG = {
  "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE}/#org`, name: S.brand, url: SITE,
  logo: `${SITE}/img/icon-512.png`, slogan: S.tagline, description: plainText(S.about), ...(S.legalName ? { legalName: S.legalName } : {}),
  founder: { "@type": "Person", "@id": `${SITE}/about/#rj`, name: S.ownerName, alternateName: "RJ" },
  sameAs: SOCIAL.map(([, u]) => u),
  contactPoint: [S.contactEmail && { "@type": "ContactPoint", contactType: "partnerships", email: S.contactEmail }, S.orderEmail && { "@type": "ContactPoint", contactType: "customer service", email: S.orderEmail }].filter(Boolean),
  sponsor: (S.sponsors || []).filter(x => x.show !== false && x.name).map(x => ({ "@type": "Organization", name: x.name, ...(x.url ? { url: x.url } : {}) })),
  address: { "@type": "PostalAddress", addressLocality: "St. Petersburg", addressRegion: "FL", addressCountry: "US" }
};
const crumbs = list => ({ "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: list.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: url })) });

function head({ title, description, url, type = "website", image, jsonld = [], noindex = false }) {
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">${noindex ? '\n<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="${type}"><meta property="og:site_name" content="${esc(S.brand)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${esc(image || SITE + "/img/og.png")}"><meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="${esc(S.brand)} ${esc(JN)}" href="${SITE}/rss.xml">
<link rel="icon" href="/img/mark.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/img/icon-180.png">
<meta name="theme-color" content="#0b0d0c">
${FONTS}
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
<style>${CSS}</style>`;
}
const header = () => `<header class="site"><div class="wrap bar">
  <a class="mark" href="/" aria-label="${esc(S.brand)} home">${MARK} VOLKSVISION</a>
  <nav><a class="hide-sm" href="/#shop">Shop</a><a href="/build/">The Mk2</a><a href="/next/">Next stop</a><a class="hide-sm" href="/journal/">${esc(JN.replace(/^The /, ""))}</a><a class="hide-sm" href="/crew/">Crew</a><a class="hide-sm" href="/work-with-me/">Work with me</a>
  <button class="cart-btn" id="openCart" type="button">Bag <b id="count">0</b></button></nav>
</div></header>`;
const footer = () => `<footer><div class="wrap foot">
  <div><div class="mark" style="margin-bottom:10px">VOLKSVISION</div>
  <p>${esc(S.brand)} is an independent creator brand from ${esc(S.city)}, run by ${esc(S.ownerName)}${S.legalName ? `. VolksVision is a brand of ${esc(S.legalName)}` : ""}. It is not affiliated with, sponsored by, or endorsed by Volkswagen AG. All vehicle photography is original work by RJ.</p></div>
  <div class="links">${SOCIAL.map(([t, u]) => `<a href="${esc(u)}" rel="me noopener" target="_blank">${t}</a>`).join("")}<a href="/build/">The Mk2</a><a href="/next/">Where's VolksVision next</a><a href="/journal/">${esc(JN)}</a><a href="/crew/">The Crew</a><a href="/media-kit/">Media kit</a><a href="/about/">About</a><a href="/work-with-me/">Work with me</a><a href="/rss.xml">RSS</a>${S.contactEmail ? `<a class="mono" style="text-transform:none" href="mailto:${esc(S.contactEmail)}">${esc(S.contactEmail)}</a>` : ""}<a class="mono" style="text-transform:none" href="mailto:${esc(S.orderEmail)}">${esc(S.orderEmail)}</a></div>
</div></footer>`;
const drawer = () => `<div class="scrim" id="scrim" hidden></div>
<aside class="drawer" id="drawer" hidden aria-label="Shopping bag">
  <header><h2>Your bag</h2><button class="x" id="closeCart" type="button">Close</button></header>
  <div class="lines" id="lines"></div>
  <form class="checkout" id="checkout">
    <div class="total"><span>Subtotal</span><span id="subtotal">$0.00</span></div>
    <label for="buyerName">Name<input id="buyerName" required autocomplete="name" maxlength="120"></label>
    <label for="buyerContact">Email or phone<input id="buyerContact" required maxlength="160"></label>
    <label for="buyerShip">Shipping address, or "pickup"<input id="buyerShip" required autocomplete="street-address" maxlength="300"></label>
    <input id="website" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
    <button class="btn solid" type="submit" id="placeOrder">Place order request</button>
    <p class="note">Free shipping over ${money(S.freeShipOver)}. RJ confirms every order personally, then sends a payment request (${esc(S.payWith)}).</p>
    <div class="done" id="done" hidden></div>
  </form>
</aside>`;
const shopScript = () => `<script>window.VV=${JSON.stringify({ config: { brand: S.brand, orderEmail: S.orderEmail, payWith: S.payWith, shipping: S.shipping, freeShipOver: S.freeShipOver }, products: PRODUCTS.map(({ id, name, price, sizes, stripe }) => ({ id, name, price, sizes, stripe })) }).replace(/</g, "\\u003c")};</script>
<script>${read("templates/shop.js")}</script>
<script>${read("templates/forms.js")}</script>`;
const page = (h, main) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${h}</head><body>
${header()}
${main}
${footer()}
${drawer()}
${shopScript()}
</body></html>
`;

// ---------- shop pieces ----------
const fmtDate = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const buyRow = p => p.sold_out ? `<div class="buyrow"><span class="price">${money(p.price)}</span><button class="add" type="button" disabled>Sold out</button></div>` : `<div class="buyrow"><span class="price">${money(p.price)}</span>
  ${p.sizes.length > 1 ? `<select id="sz-${p.id}" aria-label="Size for ${esc(p.name)}">${p.sizes.map(s => `<option>${esc(s)}</option>`).join("")}</select>` : ""}
  <button class="add" type="button" data-id="${p.id}">${p.stripe ? "Buy now" : "Add to bag"}</button></div>`;
const productCard = (p, i) => `<article class="item" data-cat="${esc(p.cat)}" id="${p.id}">
  <a class="shot" href="/shop/${p.id}/" aria-label="${esc(p.name)} details">${visual(p)}<span class="mono frame-no">${String(i + 1).padStart(2, "0")}A</span>${p.sold_out ? `<span class="tag out">Sold out</span>` : p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}</a>
  <div class="exif"><span class="mono">${esc(p.cat)}</span><span class="mono">${esc(p.exif || "")}</span></div>
  <h3><a href="/shop/${p.id}/">${esc(p.name)}</a></h3>
  <p>${esc(p.blurb)}</p>
  ${buyRow(p)}
</article>`;
const postRow = p => `<a class="post-row" href="/journal/${p.slug}/"><span class="mono">${fmtDate(p.date)} · ${p.minutes} min</span><div><h2>${esc(p.title)}</h2><p>${esc(p.description)}</p></div></a>`;
const productLd = p => ({
  "@context": "https://schema.org", "@type": "Product", "@id": `${SITE}/shop/${p.id}/#product`, name: p.name,
  description: p.blurb + (p.details ? " " + plainText(p.details) : ""), image: productImage(p), sku: p.id, url: `${SITE}/shop/${p.id}/`,
  category: p.cat, brand: { "@type": "Brand", name: S.brand },
  offers: { "@type": "Offer", price: p.price.toFixed(2), priceCurrency: "USD", availability: p.sold_out ? "https://schema.org/SoldOut" : "https://schema.org/InStock", url: `${SITE}/shop/${p.id}/`, seller: { "@id": `${SITE}/#org` },
    shippingDetails: { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" }, shippingRate: { "@type": "MonetaryAmount", value: S.shipping.toFixed(2), currency: "USD" } } }
});

const dropAlerts = (source) => `<section class="alerts" aria-labelledby="alertsTitle-${source}"><div class="wrap alerts-in">
  <div><div class="mono">${esc(LIST)}</div><h2 id="alertsTitle-${source}">${esc(T.alertsHeadline)}</h2><p>${esc(T.alertsBody)}</p></div>
  <form class="inline-form" data-form="subscribe" data-source="${source}">
    <label class="sr" for="sub-${source}">Email address</label>
    <input id="sub-${source}" name="email" type="email" required autocomplete="email" placeholder="you@email.com">
    <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <button class="btn solid" type="submit">I'm in</button>
    <div class="list-picks"><label><input type="checkbox" name="drops" checked> Drop alerts</label><label><input type="checkbox" name="glovebox" checked> New posts from ${esc(JN)}</label></div>
    <p class="form-msg" role="status"></p>
  </form>
</div></section>`;
const videoGrid = () => VIDEOS.length ? `<section class="wrap videos" aria-labelledby="vidTitle">
  <div class="sheet-head"><div><div class="mono">On the feed</div><h2 id="vidTitle">Latest from @thevolksvision</h2></div>${S.tiktok ? `<a class="btn" href="${esc(S.tiktok)}" rel="noopener" target="_blank">Follow on TikTok</a>` : ""}</div>
  <div class="vid-grid">${VIDEOS.map(v => `<a class="vid" href="${esc(v.url)}" target="_blank" rel="noopener">
    <span class="vid-thumb">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy" decoding="async">` : ""}<span class="play" aria-hidden="true"></span></span>
    <span class="mono">${v.platform}</span><span class="vid-title">${esc(v.title || "Watch on " + v.platform)}</span></a>`).join("")}</div>
</section>` : "";
const specGroups = specs => {
  const groups = new Map();
  for (const x of specs) { const k = x.label.trim(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const out = [...groups].map(([label, values]) => `<div class="spec-group"><h3>${esc(label)}</h3><dl class="specs">${values.map(v => `<div style="grid-template-columns:1fr"><dd>${v.link ? `<a href="${esc(v.link)}" rel="sponsored nofollow noopener" target="_blank">${esc(v.value)}</a>` : esc(v.value)}</dd></div>`).join("")}</dl></div>`).join("");
  return out + (specs.some(x => x.link) ? `<p class="note">Some part links are affiliate links. If you buy through them, VolksVision may earn a small commission at no extra cost to you.</p>` : "");
};
const postCard = p => `<a class="post-card" href="/journal/${p.slug}/"><span class="mono">${fmtDate(p.date)} · ${p.minutes} min read</span><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p></a>`;
const BUILD_POSTS = posts.filter(p => p.tags.some(t => /mk2|build|jetta/i.test(t))).sort((a, b) => a.date.localeCompare(b.date));
const fmtWhen = e => { const d = new Date(e.starts_at); return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }); };
const KIND_LABEL = { meet: "Meet", show: "Show", shoot: "Shoot", drop: "Drop", reveal: "Reveal", other: "Stop" };
const tracker = (compact) => STAGES.length ? `<div class="tracker${compact ? " compact" : ""}" role="img" aria-label="Build progress: ${STAGES_DONE} of ${STAGES.length} stages done">
  <div class="tracker-head"><span class="mono">Road to running · ${esc(BUILD.status || "In the build")}</span><span class="mono">${STAGES_DONE}/${STAGES.length}</span></div>
  <div class="tracker-bar"><span style="width:${Math.round(STAGES_DONE / STAGES.length * 100)}%"></span></div>
  <ol class="stages">${STAGES.map((x, i) => `<li class="${x.done ? "done" : i === STAGES_DONE ? "now" : ""}"><span>${x.done ? "✓" : i + 1}</span>${esc(x.name)}</li>`).join("")}</ol></div>` : "";
const eventCard = (e, big) => `<article class="event${big ? " big" : ""}" id="stop-${e.id}">
  <div class="event-when"><span class="pill ${e.kind === "reveal" || e.kind === "drop" ? "hot" : ""}">${KIND_LABEL[e.kind] || "Stop"}</span><span class="mono">${fmtWhen(e)}</span></div>
  <h3>${esc(e.title)}</h3><p class="r-sub">${esc([e.venue, e.city].filter(Boolean).join(" · "))}</p>
  ${e.details ? `<p>${esc(e.details)}</p>` : ""}
  ${(e.ends_at || e.starts_at) >= NOW ? `<form class="pullup" data-pullup="${e.id}">
    <button class="btn solid" type="submit">I'll pull up</button><span class="mono pull-count" data-count="${e.id}">${e.pullups} pulling up</span>
    <input name="email" type="email" placeholder="Email for a reminder (optional)" aria-label="Email for a reminder" autocomplete="email">
    <label class="check-line"><input type="checkbox" name="join"> Also join ${esc(LIST)}</label>
    <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true"><p class="form-msg" role="status"></p></form>` : ""}
  ${e.link ? `<a class="link-out" href="${esc(e.link)}" rel="noopener" target="_blank">Event details</a>` : ""}
</article>`;
const eventLd = e => ({ "@context": "https://schema.org", "@type": "Event", name: e.title, startDate: e.starts_at, ...(e.ends_at ? { endDate: e.ends_at } : {}),
  eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  location: { "@type": "Place", name: e.venue || e.city, address: e.address || e.city }, description: e.details || `${KIND_LABEL[e.kind]} with VolksVision`,
  organizer: { "@id": `${SITE}/#org` }, url: `${SITE}/next/#stop-${e.id}` });
const SPONSORS = (S.sponsors || []).filter(x => x.show !== false && x.name);
const partnersBand = (label = "Build partners") => SPONSORS.length ? `<section class="partners" aria-label="${label}"><div class="wrap partners-in">
  <span class="mono">${label}</span>
  <div class="partner-list">${SPONSORS.map(x => { const inner = x.logo ? `<img src="${esc(x.logo)}" alt="${esc(x.name)}" loading="lazy">` : `<strong>${esc(x.name)}</strong>${x.tagline ? `<span>${esc(x.tagline)}</span>` : ""}`;
    return x.url ? `<a class="partner" href="${esc(x.url)}" rel="sponsored noopener" target="_blank">${inner}</a>` : `<div class="partner">${inner}</div>`; }).join("")}</div>
  ${SPONSORS.some(x => x.disclosure) ? `<p class="note">${SPONSORS.filter(x => x.disclosure).map(x => esc(x.disclosure)).join(" · ")}</p>` : ""}
</div></section>` : "";
const specTable = (specs, limit) => specs.length ? `<dl class="specs">${specs.slice(0, limit || specs.length).map(x => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join("")}</dl>` : "";

// ---------- pages ----------
function homePage() {
  const cats = [...new Set(PRODUCTS.map(p => p.cat))];
  const car = BUILD.car || "Mk2 Volkswagen Jetta";
  const headline = S.heroHeadline || "Built slow. Shot right.";
  const [h1a, ...h1b] = headline.split(/(?<=\.)\s+/);
  const firstSpecs = [...new Map((BUILD.specs || []).map(x => [x.label, x])).values()].slice(0, 5);
  const carPhoto = (BUILD.gallery || [])[0] || (S.heroImage ? { url: S.heroImage, alt: S.heroAlt } : null);
  const main = `<main id="top">
  <section class="hero" aria-labelledby="heroTitle">
    ${S.heroImage ? `<div class="hero-media"><img src="${esc(S.heroImage)}" alt="${esc(S.heroAlt || car)}" fetchpriority="high" decoding="async"></div>` : `<div class="hero-type" aria-hidden="true"><span>MK2</span></div>`}
    <div class="wrap hero-in">
      <div class="hero-tag"><span class="mono">${esc(car)}</span><span class="mono">St. Petersburg, FL</span>${S.tiktok ? `<span class="mono">@thevolksvision</span>` : ""}</div>
      <h1 id="heroTitle">${esc(h1a)}${h1b.length ? ` <em>${esc(h1b.join(" "))}</em>` : ""}</h1>
      <p>${esc(T.heroSub)}</p>
      <div class="cta"><a class="btn solid" href="/build/">See the build</a><a class="btn" href="#shop">Shop the drop</a></div>
    </div>
  </section>

  ${STAGES.length || NEXT ? `<section class="band" style="padding-block:clamp(32px,5vw,56px)"><div class="wrap road">
    ${tracker(true)}
    ${NEXT ? `<div><div class="mono" style="margin-bottom:10px">Where is VolksVision next?</div>${eventCard(NEXT, false)}<a class="link-out" href="/next/">All stops</a></div>` : `<div><div class="mono" style="margin-bottom:10px">Where is VolksVision next?</div><p class="r-sub">New stops drop here first. Join ${esc(LIST)} to hear about them.</p></div>`}
  </div></section>` : ""}
  <section class="band" id="shop" aria-labelledby="shopTitle"><div class="wrap">
    <div class="band-head">
      <div><div class="drop-meta">${S.dropName ? `<span class="pill hot">${esc(S.dropName)}</span>` : ""}${S.dropNote ? `<span class="pill">${esc(S.dropNote)}</span>` : ""}</div>
      <h2 id="shopTitle" style="margin-top:12px">${esc(T.shopTitle)}</h2></div>
      ${cats.length > 1 ? `<div class="filters" role="group" aria-label="Filter products">
        <button class="chip" type="button" data-f="all" aria-pressed="true">All</button>
        ${cats.map(c => `<button class="chip" type="button" data-f="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join("")}
      </div>` : ""}
    </div>
    <div class="grid">${PRODUCTS.map(productCard).join("\n") || `<p class="empty">The next drop is coming. Get on the list below.</p>`}</div>
  </div></section>

  <section class="band" aria-labelledby="carTitle"><div class="wrap car">
    <a class="car-photo" href="/build/" aria-label="See the ${esc(car)} build">${carPhoto ? `<img src="${esc(carPhoto.url)}" alt="${esc(carPhoto.alt || car)}" loading="lazy" decoding="async">` : `<span class="ph" aria-hidden="true">MK2</span>`}</a>
    <div>
      <div class="mono">The car</div>
      <h2 id="carTitle" style="margin-top:10px">${esc(car)}</h2>
      <p class="dek">${esc(BUILD.headline || T.carIntro)}</p>
      ${firstSpecs.length ? `<dl class="specs">${firstSpecs.map(x => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join("")}</dl>` : ""}
      <p style="margin-top:22px"><a class="btn" href="/build/">Full build sheet</a></p>
    </div>
  </div></section>

  ${VIDEOS.length ? `<div class="band" style="padding:0">${videoGrid()}</div>` : ""}

  ${posts.length ? `<section class="band" aria-labelledby="jTitle"><div class="wrap">
    <div class="band-head"><div><div class="mono">${esc(JN)}</div><h2 id="jTitle" style="margin-top:10px">Build notes &amp; guides</h2></div><a class="btn" href="/journal/">All posts</a></div>
    <div class="post-cards">${posts.slice(0, 3).map(postCard).join("")}</div>
  </div></section>` : ""}

  ${partnersBand()}
  ${FEATURED ? `<section class="band" aria-labelledby="cotwTitle"><div class="wrap car">
    <a class="car-photo" href="/crew/"><img src="${esc(FEATURED.photo)}" alt="${esc(FEATURED.car)} owned by ${esc(FEATURED.handle || FEATURED.name)}" loading="lazy" decoding="async"></a>
    <div><div class="mono">Crew car of the week</div><h2 id="cotwTitle" style="margin-top:10px">${esc(FEATURED.car)}</h2>
      <p class="dek">${esc(FEATURED.handle || FEATURED.name)}${FEATURED.story ? `: ${esc(FEATURED.story.slice(0, 180))}` : ""}</p>
      <div class="local"><a class="btn solid" href="/crew/#submit">Submit your car</a><a class="btn" href="/crew/">See the Crew</a></div></div>
  </div></section>` : ""}
  <section class="band" id="story" aria-labelledby="storyTitle"><div class="wrap story-grid">
    <div><div class="mono">${esc(T.storyEyebrow)}</div><h2 id="storyTitle" style="margin-top:10px">${esc(T.storyHeadline)}</h2></div>
    <div><div class="prose">${markdown(S.about, SITE)}</div>
      <div class="local"><a class="btn" href="/about/">More about RJ</a><a class="btn" href="/work-with-me/">Work with me</a></div></div>
  </div></section>

  ${dropAlerts("home")}
</main>`;
  return page(head({
    title: `${S.brand} | Mk2 Jetta Build & VW Culture Merch, St. Pete FL`,
    description: `RJ's ${car} build, VW culture videos and official VolksVision shirts and merch from St. Petersburg, Florida.`,
    url: SITE + "/", image: S.heroImage ? abs(S.heroImage) : undefined,
    jsonld: [ORG, { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE}/#site`, name: S.brand, url: SITE, publisher: { "@id": `${SITE}/#org` } },
      { "@context": "https://schema.org", "@type": "ItemList", name: `${S.brand} shop`, itemListElement: PRODUCTS.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/shop/${p.id}/` })) }]
  }), main);
}

function productPage(p) {
  const url = `${SITE}/shop/${p.id}/`;
  const others = PRODUCTS.filter(x => x.id !== p.id).slice(0, 3);
  const related = posts.slice(0, 2);
  const main = `<main class="wrap article">
  <div class="crumbs"><a href="/#shop">Shop</a> · ${esc(p.cat)}</div>
  <div class="product">
    <div class="shot">${visual(p, true)}${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}</div>
    <div class="product-info">
      <h1>${esc(p.name)}</h1>
      <p class="dek">${esc(p.blurb)}</p>
      ${buyRow(p)}
      ${p.details ? `<div class="prose" style="margin:24px 0 0">${markdown(p.details, SITE)}</div>` : ""}
      <p class="note" style="margin-top:20px">Ships from ${esc(S.city)}. Flat ${money(S.shipping)} shipping, free over ${money(S.freeShipOver)}, or local pickup.</p>
    </div>
  </div>
  ${others.length ? `<section style="margin-top:56px"><div class="sheet-head"><h2>More from the roll</h2></div><div class="grid">${others.map((x) => productCard(x, PRODUCTS.indexOf(x))).join("")}</div></section>` : ""}
  ${related.length ? `<section style="margin-top:40px"><div class="sheet-head"><h2>From ${esc(JN)}</h2></div><div class="posts">${related.map(postRow).join("")}</div></section>` : ""}
</main>`;
  return page(head({ title: `${p.name} | ${S.brand}`, description: `${p.blurb} ${money(p.price)} from VolksVision, St. Petersburg, FL.`.slice(0, 160), url, type: "product", image: productImage(p),
    jsonld: [productLd(p), crumbs([["Home", SITE + "/"], ["Shop", SITE + "/#shop"], [p.name, url]])] }), main);
}

function aboutPage() {
  const url = `${SITE}/about/`;
  const main = `<main class="wrap article"><article>
  <header><div class="crumbs">About</div><h1>${esc(S.ownerName)}</h1><p class="dek">${esc(S.ownerTitle)}, VolksVision. ${esc(S.tagline)}, from ${esc(S.city)}.</p></header>
  <div class="prose">${markdown(S.about, SITE)}
  <h2>Follow along</h2>
  <ul>${SOCIAL.map(([t, u]) => `<li><a href="${esc(u)}" rel="me noopener" target="_blank">${t}</a></li>`).join("")}<li><a href="/journal/">${esc(JN)}</a></li></ul></div>
  <aside class="shop-cta"><p><strong>Wear the work.</strong> Tees, hoodies and signed prints from RJ's lens.</p><a class="btn solid" href="/#shop">Shop VolksVision</a></aside>
</article></main>`;
  return page(head({ title: `${S.ownerName} | ${S.ownerTitle}, ${S.brand}`, description: `Meet ${S.ownerName} (RJ), ${S.ownerTitle.toLowerCase()} of VolksVision: the Mk2 Jetta, VW culture content and merch from St. Petersburg, FL.`, url, type: "profile",
    jsonld: [{ "@context": "https://schema.org", "@type": "AboutPage", url, mainEntity: { "@type": "Person", "@id": `${SITE}/about/#rj`, name: S.ownerName, alternateName: "RJ", jobTitle: S.ownerTitle, worksFor: { "@id": `${SITE}/#org` }, sameAs: SOCIAL.map(([, u]) => u), homeLocation: { "@type": "Place", name: "St. Petersburg, Florida" } } },
      crumbs([["Home", SITE + "/"], ["About", url]])] }), main);
}

function buildPage() {
  const url = `${SITE}/build/`;
  const car = BUILD.car || "Mk2 Volkswagen Jetta";
  const g = BUILD.gallery || [];
  const lead = S.heroImage ? { url: S.heroImage, alt: S.heroAlt } : g[0];
  const main = `<main>
  <section class="build-hero">${lead ? `<img src="${esc(lead.url)}" alt="${esc(lead.alt || car)}" fetchpriority="high" decoding="async">` : ""}
    <div class="wrap build-hero-in"><div class="crumbs"><a href="/">VolksVision</a> · The build · St. Petersburg, FL</div><h1>${esc(car)}</h1>${BUILD.headline ? `<p class="dek">${esc(BUILD.headline)}</p>` : ""}</div></section>
  <div class="wrap" style="padding-top:clamp(32px,5vw,48px)">${tracker(false)}</div>
  <div class="wrap build-body">
    <aside><div class="mono" style="margin-bottom:14px">Spec sheet</div>${specGroups(BUILD.specs || []) || `<p class="r-sub">The full spec sheet is on the way.</p>`}
      <a class="btn solid" href="/#shop" style="margin-top:12px">Shop the merch</a></aside>
    <div>
      <article class="prose">${BUILD.story ? markdown(BUILD.story, SITE) : `<p>RJ's ${esc(car)} is the car behind VolksVision, and it's mid-build: not running yet. Every stage of bringing it back is documented here and on the socials. Follow along on ${S.tiktok ? `<a href="${esc(S.tiktok)}" rel="noopener" target="_blank">TikTok</a>` : "the Journal"} for updates.</p>`}</article>
      ${BUILD_POSTS.length ? `<section style="margin-top:40px"><div class="mono" style="margin-bottom:16px">Build log</div><ol class="timeline">${BUILD_POSTS.map(p => `<li><span class="mono">${fmtDate(p.date)}</span><br><a href="/journal/${p.slug}/">${esc(p.title)}</a></li>`).join("")}</ol></section>` : ""}
    </div>
  </div>
  ${g.length ? `<section class="wrap gallery" aria-label="${esc(car)} photos">${g.map((x, i) => `<a href="${esc(x.url)}" class="g-item${i % 5 === 0 ? " wide" : ""}" target="_blank" rel="noopener"><img src="${esc(x.url)}" alt="${esc(x.alt || car + " photo " + (i + 1))}" loading="lazy" decoding="async"></a>`).join("")}</section>` : ""}
  ${partnersBand("This build is backed by")}
  ${VIDEOS.length ? `<div style="border-top:1px solid var(--line)">${videoGrid()}</div>` : ""}
  ${dropAlerts("build")}
</main>`;
  return page(head({ title: `${car} Build: Specs, Mods & Photos | ${S.brand}`, description: (BUILD.headline ? `${BUILD.headline}. ` : "") + `RJ's ${car} build from St. Petersburg, FL: spec sheet, mods, photos and build log.`.slice(0, 158), url, type: "article", image: abs(lead?.url),
    jsonld: [{ "@context": "https://schema.org", "@type": "Car", name: car, description: plainText(BUILD.story || BUILD.headline || ""), brand: { "@type": "Brand", name: "Volkswagen" }, model: "Jetta", vehicleConfiguration: "Mk2",
      image: [lead?.url, ...g.map(x => x.url)].filter(Boolean).map(abs), url },
      crumbs([["Home", SITE + "/"], ["The Mk2", url]])] }), main);
}

function workPage() {
  const url = `${SITE}/work-with-me/`;
  const main = `<main class="wrap article"><article>
  <header><div class="crumbs">Work with me · ${esc(S.ownerName)}, ${esc(S.ownerTitle)}</div><h1>Brands, collabs and shoots</h1><p class="dek">${esc(T.workIntro)}</p></header>
  <div class="work">
    <div class="prose" style="margin:0">
      <h2>What I do</h2>
      <ul><li><strong>Sponsored content:</strong> short-form video on TikTok and Instagram, shot on real builds.</li>
      <li><strong>Product features:</strong> parts, detailing and gear, used and filmed honestly.</li>
      <li><strong>Photo and video shoots:</strong> rollers, walkarounds and meet coverage around Tampa Bay.</li>
      <li><strong>Merch collabs:</strong> co-branded drops with shops and clubs.</li></ul>
      <p><a href="/media-kit/">See the media kit</a> for audience and numbers.</p>
      ${S.contactEmail ? `<p>Rather email? <a href="mailto:${esc(S.contactEmail)}">${esc(S.contactEmail)}</a></p>` : ""}
      <p>Follow along first: ${SOCIAL.map(([t, u]) => `<a href="${esc(u)}" rel="noopener" target="_blank">${t}</a>`).join(" · ")}</p>
    </div>
    <form class="stack-form" data-form="inquiry">
      <label for="iq-name">Your name<input id="iq-name" name="name" required autocomplete="name" maxlength="120"></label>
      <label for="iq-email">Email<input id="iq-email" name="email" type="email" required autocomplete="email" maxlength="160"></label>
      <label for="iq-company">Brand or shop (optional)<input id="iq-company" name="company" autocomplete="organization" maxlength="120"></label>
      <label for="iq-kind">What's it about?<select id="iq-kind" name="kind"><option>Brand sponsorship</option><option>Collab</option><option>Photo or video shoot</option><option>Wholesale</option><option>Other</option></select></label>
      <label for="iq-msg">Message<textarea id="iq-msg" name="message" required rows="5" maxlength="4000"></textarea></label>
      <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
      <button class="btn solid" type="submit">Send</button>
      <p class="form-msg" role="status"></p>
    </form>
  </div>
</article></main>`;
  return page(head({ title: `Work With VolksVision | VW Car Content Creator, Tampa Bay`, description: "Sponsorships, collabs and photo or video shoots with RJ of VolksVision, a VW and car culture creator in St. Petersburg, FL.", url,
    jsonld: [{ "@context": "https://schema.org", "@type": "ContactPage", url, about: { "@id": `${SITE}/#org` } }, crumbs([["Home", SITE + "/"], ["Work with me", url]])] }), main);
}

function crewPage() {
  const url = `${SITE}/crew/`;
  const main = `<main>
  <section class="journal-head wrap"><div class="mono">VolksVision</div><h1>${esc(T.crewHeadline)}</h1><p>${esc(T.crewIntro)}</p>
    <p style="margin-top:20px"><a class="btn solid" href="#submit">Submit your car</a></p></section>
  ${CREW.length ? `<section class="wrap gallery" style="padding-top:32px" aria-label="Crew cars">${CREW.map(c => `<figure class="crew-card${c.featured ? " featured" : ""}">
    <img src="${esc(c.photo)}" alt="${esc(c.car)} owned by ${esc(c.handle || c.name)}" loading="lazy" decoding="async">
    <figcaption>${c.featured ? `<span class="pill hot">Car of the week</span>` : ""}<strong>${esc(c.car)}</strong><span>${esc(c.handle || c.name)}</span></figcaption></figure>`).join("")}</section>`
    : `<section class="wrap" style="padding-block:32px"><p class="r-sub">The first Crew cars land here soon. Yours could be first.</p></section>`}
  <section class="wrap" id="submit" style="padding-block:clamp(40px,6vw,72px)"><div class="work">
    <div class="prose" style="margin:0"><h2>Get your car on VolksVision</h2><p>Any car, any budget, any stage of the build. Clean daily, project on jack stands, or full send show car. RJ picks a Crew car of the week and features it here and on the socials.</p>
      <ul><li>One good photo, the whole car in frame. Daylight or golden hour is best.</li><li>Tell us what it is and one thing you love about it.</li><li>Add your handle so we can tag you.</li></ul></div>
    <form class="stack-form" data-form="crew" enctype="multipart/form-data">
      <label for="cr-name">Your name<input id="cr-name" name="name" required maxlength="80" autocomplete="name"></label>
      <label for="cr-handle">TikTok or Instagram handle<input id="cr-handle" name="handle" maxlength="60" placeholder="@yourhandle" autocapitalize="none"></label>
      <label for="cr-email">Email (optional, so RJ can reach you)<input id="cr-email" name="email" type="email" maxlength="160" autocomplete="email"></label>
      <label for="cr-car">Your car<input id="cr-car" name="car" required maxlength="120" placeholder="1991 VW Jetta GLI, bagged"></label>
      <label for="cr-story">The story (optional)<textarea id="cr-story" name="story" rows="4" maxlength="1200"></textarea></label>
      <label for="cr-photo">Photo<input id="cr-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></label>
      <label class="check-line"><input type="checkbox" name="consent" value="yes" required> It's my car and my photo, and VolksVision can feature it with my handle.</label>
      <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
      <button class="btn solid" type="submit">Send it</button>
      <p class="form-msg" role="status"></p>
    </form></div></section>
  ${dropAlerts("crew")}
</main>`;
  return page(head({ title: `The Crew: Reader Car Features | ${S.brand}`, description: "Submit your car to be featured on VolksVision. VWs, Mk2s and every build in between. One gets picked as Crew car of the week.", url,
    image: FEATURED ? FEATURED.photo : undefined,
    jsonld: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "The Crew", url, isPartOf: { "@id": `${SITE}/#site` } }, crumbs([["Home", SITE + "/"], ["The Crew", url]])] }), main);
}

function nextPage() {
  const url = `${SITE}/next/`;
  const main = `<main>
  <section class="journal-head wrap"><div class="mono">Meets · shows · shoots · drops</div><h1>Where is VolksVision next?</h1><p>Pull up, say what's up, bring your car. Tap "I'll pull up" so RJ knows you're coming.</p></section>
  <section class="wrap events" style="padding-block:32px">${UPCOMING.map(e => eventCard(e, true)).join("") || `<p class="r-sub">No stops on the calendar right now. Join ${esc(LIST)} and you'll hear first.</p>`}</section>
  ${PAST.length ? `<section class="wrap" style="padding-bottom:48px"><div class="mono" style="margin-bottom:12px">Been there</div><div class="events past">${PAST.map(e => eventCard(e, false)).join("")}</div></section>` : ""}
  ${dropAlerts("next")}
</main>`;
  return page(head({ title: `Where Is VolksVision Next? VW Meets & Events in Tampa Bay | ${S.brand}`, description: "Upcoming meets, car shows, shoots and merch drops with RJ Savell Keelin and the VolksVision Mk2 Jetta around St. Petersburg and Tampa Bay.", url,
    jsonld: [...UPCOMING.slice(0, 10).map(eventLd), crumbs([["Home", SITE + "/"], ["Where is VolksVision next?", url]])] }), main);
}

function mediaKitPage() {
  const url = `${SITE}/media-kit/`, mk = S.mediaKit || {}, f = KIT?.followers || {};
  const num = x => x == null ? null : x >= 1e6 ? (x / 1e6).toFixed(1) + "M" : x >= 1e3 ? (x / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(x);
  const stats = mk.showNumbers && KIT ? [["TikTok", num(f.tiktok)], ["Instagram", num(f.instagram)], ["YouTube", num(f.youtube)], ["Avg views, 30 days", num(KIT.avgViews)], ["Engagement", KIT.engagement != null ? (KIT.engagement * 100).toFixed(1) + "%" : null], [`${LIST} subscribers`, null]].filter(([, v]) => v) : [];
  const main = `<main class="wrap article"><article>
  <header><div class="crumbs">Media kit · ${esc(S.ownerName)}, ${esc(S.ownerTitle)}</div><h1>Partner with VolksVision</h1><p class="dek">${esc(mk.pitch)}</p></header>
  ${stats.length ? `<dl class="kit-stats">${stats.map(([k, v]) => `<div><dt class="mono">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl><p class="note" style="text-align:center">Updated ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} from RJ's own analytics.</p>` : ""}
  <div class="prose">
    <h2>The audience</h2><p>${esc(mk.audience)}</p>
    <h2>The car</h2><p>${esc(BUILD.car || "Mk2 Volkswagen Jetta")}: ${esc(BUILD.status || "In the build")}, ${STAGES_DONE} of ${STAGES.length} stages done. Brands that join the build get featured in every episode that uses their part. <a href="/build/">See the build</a>.</p>
    ${(mk.services || []).length ? `<h2>What I offer</h2><ul>${mk.services.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${(() => { const names = [...new Set([...SPONSORS.map(x => x.name), ...(mk.partners || [])])]; return names.length ? `<h2>Partners</h2><p>${names.map(esc).join(" · ")}</p>` : ""; })()}
    <h2>Follow along</h2><ul>${SOCIAL.map(([t, u]) => `<li><a href="${esc(u)}" rel="noopener" target="_blank">${t}</a></li>`).join("")}</ul>
  </div>
  <aside class="shop-cta"><p><strong>Got a project in mind?</strong> Send a quick note. RJ replies to every brand.${S.contactEmail ? ` Or email <a href="mailto:${esc(S.contactEmail)}">${esc(S.contactEmail)}</a>.` : ""}</p><a class="btn solid" href="/work-with-me/">Work with me</a></aside>
</article></main>`;
  return page(head({ title: `Media Kit: ${S.ownerName}, VolksVision | Car Creator Partnerships`, description: `Partner with ${S.ownerName} and VolksVision: Gen Z car audience, Mk2 Jetta build series, Tampa Bay meets. Services, audience and numbers.`, url,
    jsonld: [crumbs([["Home", SITE + "/"], ["Media kit", url]])] }), main);
}

function journalIndex() {
  const url = `${SITE}/journal/`;
  const main = `<main class="wrap">
  <section class="journal-head"><div class="mono">VolksVision</div><h1>${esc(JN)}</h1><p>Volkswagen and tuner culture in Tampa Bay: VR6 builds, meets, car photography and keeping a VW healthy in Florida.</p></section>
  <div class="posts">${posts.map(postRow).join("") || `<p class="empty">The first post is on its way.</p>`}</div>
</main>`;
  return page(head({ title: `${JN}: Mk2 Jetta & VW Culture Notes | ${S.brand}`, description: "VW and VR6 builds, car photography and Tampa Bay meet coverage from RJ at VolksVision.", url,
    jsonld: [{ "@context": "https://schema.org", "@type": "Blog", name: `${S.brand} ${JN}`, url, publisher: { "@id": `${SITE}/#org` } }, crumbs([["Home", SITE + "/"], [JN, url]])] }), main);
}

function postPage(p) {
  const url = `${SITE}/journal/${p.slug}/`;
  const tagSet = new Set(p.tags);
  const related = posts.filter(x => x.slug !== p.slug)
    .map(x => ({ x, score: x.tags.filter(t => tagSet.has(t)).length })).sort((a, b) => b.score - a.score).slice(0, 3).map(r => r.x);
  const picks = PRODUCTS.slice(0, 3);
  const main = `<main class="wrap article"><article>
  <header><div class="crumbs"><a href="/journal/">${esc(JN)}</a> · <time datetime="${p.date}">${fmtDate(p.date)}</time> · ${p.minutes} min read · by <a href="/about/">${esc(S.ownerName)}</a></div>
  <h1>${esc(p.title)}</h1><p class="dek">${esc(p.description)}</p></header>
  ${p.image ? `<figure class="cover"><img src="${esc(p.image)}" alt="${esc(p.image_alt || p.title)}" fetchpriority="high" decoding="async" width="1600" height="1000"></figure>` : ""}
  <div class="prose">${p.html}</div>
  ${picks.length ? `<aside class="shop-cta"><p><strong>Wear the work.</strong> ${picks.map(x => `<a href="/shop/${x.id}/">${esc(x.name)}</a>`).join(", ")} and more from RJ's lens.</p><a class="btn solid" href="/#shop">Shop VolksVision</a></aside>` : ""}
  ${related.length ? `<section class="prose" style="margin-top:48px"><h2>Keep reading</h2></section><div class="posts" style="max-width:68ch;margin:0 auto">${related.map(postRow).join("")}</div>` : ""}
</article></main>`;
  return page(head({ title: `${p.title} | ${S.brand}`, description: p.description, url, type: "article", image: abs(p.image),
    jsonld: [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.description,
      datePublished: p.date, dateModified: (p.updated_at || p.date).slice(0, 10), mainEntityOfPage: url, url, wordCount: wordCount(p.body),
      author: { "@type": "Person", "@id": `${SITE}/about/#rj`, name: S.ownerName, url: `${SITE}/about/` }, publisher: { "@id": `${SITE}/#org` },
      keywords: p.tags.join(", "), image: abs(p.image) || `${SITE}/img/og.png` },
      crumbs([["Home", SITE + "/"], [JN, SITE + "/journal/"], [p.title, url]])] }), main);
}

// ---------- run ----------
fs.rmSync(OUT, { recursive: true, force: true });
write("index.html", homePage());
write("about/index.html", aboutPage());
write("build/index.html", buildPage());
write("work-with-me/index.html", workPage());
write("crew/index.html", crewPage());
write("next/index.html", nextPage());
write("media-kit/index.html", mediaKitPage());
write("journal/index.html", journalIndex());
for (const p of posts) write(`journal/${p.slug}/index.html`, postPage(p));
for (const p of PRODUCTS) write(`shop/${p.id}/index.html`, productPage(p));
write("404.html", page(head({ title: `Out of frame | ${S.brand}`, description: "This page doesn't exist.", url: SITE + "/404", noindex: true }),
  `<main class="wrap article"><article><header><div class="crumbs">Frame 404</div><h1 class="wide">Out of frame.</h1><p class="dek">That page moved or never existed.</p><p style="margin-top:24px"><a class="btn solid" href="/">Back to VolksVision</a></p></header></article></main>`));

const urls = [
  { loc: `${SITE}/`, images: PRODUCTS.map(productImage) },
  { loc: `${SITE}/build/`, images: [S.heroImage, ...(BUILD.gallery || []).map(x => x.url)].filter(Boolean).map(abs) },
  { loc: `${SITE}/about/` },
  { loc: `${SITE}/work-with-me/` },
  { loc: `${SITE}/crew/`, images: CREW.map(c => c.photo) },
  { loc: `${SITE}/next/` },
  { loc: `${SITE}/media-kit/` },
  { loc: `${SITE}/journal/`, lastmod: posts[0]?.date },
  ...PRODUCTS.map(p => ({ loc: `${SITE}/shop/${p.id}/`, lastmod: (p.updated_at || "").slice(0, 10), images: [productImage(p)] })),
  ...posts.map(p => ({ loc: `${SITE}/journal/${p.slug}/`, lastmod: (p.updated_at || p.date).slice(0, 10), images: p.image ? [abs(p.image)] : [] }))
];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(u => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}${(u.images || []).filter(Boolean).map(i => `<image:image><image:loc>${esc(i)}</image:loc></image:image>`).join("")}</url>`).join("\n")}
</urlset>
`);
write("rss.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${esc(S.brand)} ${esc(JN)}</title><link>${SITE}/journal/</link><description>${esc(S.tagline)}</description>
${posts.map(p => `<item><title>${esc(p.title)}</title><link>${SITE}/journal/${p.slug}/</link><guid>${SITE}/journal/${p.slug}/</guid><pubDate>${new Date(p.date + "T12:00:00Z").toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`).join("\n")}
</channel></rss>
`);
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`);

for (const k of Object.keys(ART)) write(`img/${k}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#131715"/>${ART[k]}</svg>`);
write("img/mark.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#0b0d0c"/><defs><mask id="w"><rect width="40" height="40" fill="#fff"/><g fill="#000"><path transform="rotate(45 20 20)" d="M17.1 9.2A2.9 2.9 0 0 1 22.9 9.2Q22.9 11.4 20 14.8Q17.1 11.4 17.1 9.2Z"/><path transform="rotate(135 20 20)" d="M17.1 9.2A2.9 2.9 0 0 1 22.9 9.2Q22.9 11.4 20 14.8Q17.1 11.4 17.1 9.2Z"/><path transform="rotate(225 20 20)" d="M17.1 9.2A2.9 2.9 0 0 1 22.9 9.2Q22.9 11.4 20 14.8Q17.1 11.4 17.1 9.2Z"/><path transform="rotate(315 20 20)" d="M17.1 9.2A2.9 2.9 0 0 1 22.9 9.2Q22.9 11.4 20 14.8Q17.1 11.4 17.1 9.2Z"/><circle transform="rotate(0 20 20)" cx="20" cy="14.4" r="1"/><circle transform="rotate(90 20 20)" cx="20" cy="14.4" r="1"/><circle transform="rotate(180 20 20)" cx="20" cy="14.4" r="1"/><circle transform="rotate(270 20 20)" cx="20" cy="14.4" r="1"/><circle cx="20" cy="20" r="4.3"/></g></mask></defs><circle cx="20" cy="20" r="18" fill="none" stroke="#eef0ec" stroke-width="2.6"/><circle cx="20" cy="20" r="14.2" fill="#eef0ec" mask="url(#w)"/><circle cx="20" cy="20" r="3.4" fill="#f2a93b"/></svg>`);
write("js/markdown.js", read("lib/markdown.js"));
write("js/analytics.js", read("lib/analytics.js"));   // the phone editor's live preview uses the same renderer

// static/ holds files copied as-is (admin app, icons, social image, _headers)
const copyDir = (from, to) => { for (const f of fs.readdirSync(from, { withFileTypes: true })) {
  const a = path.join(from, f.name), b = path.join(to, f.name);
  if (f.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copyDir(a, b); } else fs.copyFileSync(a, b);
} };
copyDir(path.join(here, "static"), OUT);

// IndexNow: tells Bing, Yandex and others about new and changed pages right away.
// (Google discovers changes through the sitemap in Search Console.)
if (env.INDEXNOW_KEY && /^[a-zA-Z0-9-]{8,128}$/.test(env.INDEXNOW_KEY)) {
  write(`${env.INDEXNOW_KEY}.txt`, env.INDEXNOW_KEY);
  if (env.CF_PAGES_BRANCH === "main" || env.INDEXNOW_PING === "1") {
    try {
      const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: new URL(SITE).host, key: env.INDEXNOW_KEY, keyLocation: `${SITE}/${env.INDEXNOW_KEY}.txt`, urlList: urls.map(u => u.loc) }) });
      console.log(`IndexNow: ${res.status}`);
    } catch (e) { console.log(`IndexNow skipped: ${e.message}`); }
  }
}

if (process.argv.includes("--preview")) {
  const html = fs.readFileSync(path.join(OUT, "index.html"), "utf8");
  fs.writeFileSync(path.join(here, "preview.html"), html.replace(/^[\s\S]*?<head>/, "").replace(/<\/head><body>/, "").replace(/<\/body><\/html>\s*$/, "").replace(/<meta charset="utf-8"><meta name="viewport"[^>]*>/, ""));
}
console.log(`Built ${PRODUCTS.length} product page(s) and ${posts.length} post(s) ${hasDb(env) ? "from Supabase" : "from local starter content"}.`);
