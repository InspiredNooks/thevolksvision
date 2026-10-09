# VolksVision

RJ's site: his Mk2 Jetta build, merch shop, weekly Journal and fan list, with a phone app ("Studio") to run all of it.
Runs on **Netlify + Supabase + Resend**, plus the Claude API for weekly posts, the coach and captions. (Cloudflare Pages also works: `functions/` is the Pages version of the same API.)

## What RJ does from his phone: the Studio

Open `https://thevolksvision.com/admin`, sign in with the passphrase, then in Safari tap **Share → Add to Home Screen**. It opens like an app. Every screen has a **?** button and shows a short how-to popup the first time he opens it.

| Tab | What he can do |
|---|---|
| **Grow** | **Today:** weekly video goal and streak, Mk2 build progress, next stop, what to film today, milestones, nudges. **🎬 Edit & post everywhere:** Quick Edit (trim, 9:16 / 16:9 / 1:1, hook text, episode badge, watermark, export), captions for TikTok / Reels / Shorts / Facebook (or a long-form YouTube kit: 3 titles, chapters, tags, thumbnail text, teaser), the YouTube **thumbnail maker**, then one tap per platform through the phone's share sheet; each post is logged automatically. **Videos:** log numbers per video (or sync YouTube). **Stats:** the weekly **coach** plus breakdowns by pillar, opening, length, day and platform. **Ideas, Plan:** idea bank, playbook, 90-day checklist, Sunday numbers. |
| **Money** | **Overview** of this month's income vs his goal (merch, sponsors, creator payouts, affiliate), **Orders**, a sponsorship **Deals** pipeline (pitched → paid, deliverables, due dates), an **Income** log, and his public **Media kit**. |
| **Shop** | Products with camera photos, prices, sizes, sold-out, hide, Stripe links. |
| **Journal** | The Glovebox: auto-written weekly posts (auto-publish on/off), his own posts, ranking checklist. |
| **Mk2** | **Build:** status and "Road to running" stages (the car isn't running yet), spec sheet with optional affiliate links, story, gallery, homepage photo and drop name, video links. **Next stops:** "Where is VolksVision next?" meets, shows, shoots and drops, with live "I'll pull up" counts. |
| **More** | **Pit Crew** (email list with drops / Glovebox choices, one-tap email blasts with automatic unsubscribe, brand inquiries → deals), **Crew** (approve follower cars, pick Crew car of the week), **Site text** (every line of website wording), **Settings** (name, title, weekly goal, pillars, opening styles, blog and list names, socials, shipping, Glovebox topics). |

Every save that changes the public site rebuilds it automatically; changes are live in about a minute.

### Events: the map and the event finder
- `/next/` shows a dark map of Tampa Bay (`static/img/bay-map.svg`, made by `scripts/make-bay-map.mjs` from OpenStreetMap and Natural Earth data) with a yellow pin per stop. Hover or tap a pin for details and an "I'm going" button. Solid pins are stops RJ is going to; outlined pins are community events.
- Pins come from the address when a stop is saved (US Census geocoder, then OpenStreetMap, then the town center). RJ can tap the map in the Studio to move a pin.
- The event finder (`lib/scout.js`) reads RJ's saved sources and searches the web for cars & coffee, meets and shows. It runs every Monday and Thursday (`.github/workflows/scout.yml`) and from the Studio (Look now). RJ can also paste a social post or a flyer screenshot (Add from a post). New finds wait in Found for you unless he picks Add automatically. Needs `ANTHROPIC_API_KEY` in Netlify and in GitHub Actions secrets.

### Honest limits
- **TikTok and Instagram stats** are logged by RJ (about 20 seconds per video). Automatic pulls need TikTok and Meta developer apps, which require their review; YouTube syncs automatically with an API key.
- **Posting** uses the phone's share sheet (one tap per app, caption copied). Fully automatic posting needs the same platform approvals.
- **Quick Edit** is for short-form finishing. Long multi-clip edits belong in CapCut; the Studio handles the thumbnail, titles, chapters, posting and tracking.

## The coach

Every Sunday (and on demand) the coach reads RJ's numbers and writes what worked, what to change, a 5-video plan, a suggested pillar mix and one crew-building move. Its reference is `lib/playbook.js`, distilled from research on Cleetus McFarland, Westen Champlin, Adam LZ, Hoonigan, TJ Hunt, Donut Media, Mighty Car Mods, Hoovie's Garage, B is for Build, Daniel Mac, Garage Goblin and others, plus platform guidance from Instagram, TikTok and YouTube. It knows the Mk2 is mid-build and never suggests street racing (a felony for takeovers in Florida since July 2025), fake giveaways or bought engagement.

## How it ranks

- Static, fast pages with structured data: Organization, Product (with price, availability, shipping), BlogPosting, Car (the Mk2), Breadcrumbs.
- A page per product (`/shop/<name>/`), the build page (`/build/`), About, Work with me, and the Journal, all cross-linked.
- Image sitemap, RSS, canonical URLs, social share image, IndexNow pings to Bing and others on every rebuild.
- Weekly posts target Mk2 Jetta searches where small sites can win (queue in Studio → More). Posts link to real products and earlier posts only; made-up links are stripped.
- Photos are resized on the phone before upload, and the Studio requires a description for each one.

## One-time setup (about 45 minutes)

1. **Domain.** `thevolksvision.com` is the one address (site and `shop@thevolksvision.com` email forwarding). Keep it on DreamHost nameservers. In its DreamHost DNS add an **A** record (host blank) → `75.2.60.5` and a **CNAME** `www` → `thevolksvision.netlify.app`; never touch the MX records. In Netlify → Domain management add `thevolksvision.com` as primary. If `thevolksvision.shop` is ever registered, add it the same way as a domain alias: `netlify.toml` already sends .shop and www to the .com with a permanent redirect, so Google sees one site.
2. **Supabase.** New project → SQL Editor → run `supabase/schema.sql`. Copy the project URL and the **service role** key.
3. **Netlify.** Link the project to this repo (branch `main`, base directory blank):
   - Netlify reads netlify.toml at the repo root (build command and publish directory are set there).
   - Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN` (RJ's passphrase, long), `MANAGER_TOKEN` (Cara's own passphrase, optional), `ANTHROPIC_API_KEY` (coach and captions), `RESEND_API_KEY`, `ORDER_NOTIFY_EMAIL` (`thevolksvision@gmail.com`, the default), `ORDER_FROM_EMAIL` (`VolksVision <shop@thevolksvision.com>`; verify thevolksvision.com in Resend), `INDEXNOW_KEY` (any random 32-character string), `LIST_SECRET` (random string for unsubscribe links), optional `YOUTUBE_API_KEY` (YouTube Data API v3). Card checkout: `STRIPE_SECRET_KEY` (RJ's Stripe secret key) and `STRIPE_WEBHOOK_SECRET` (from a Stripe webhook pointed at `https://thevolksvision.com/api/stripe-webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`); optional `STRIPE_AUTOMATIC_TAX=1` once Stripe Tax is set up for Florida. Push notifications need no setup: the site makes its own signing keys (stored in `vv_secrets`). RJ turns alerts on in More → Settings; fans tap "Get drop alerts on this phone" (iPhone: after Add to Home Screen). Without the Stripe keys the shop takes order requests and RJ sends payment requests by hand.
   - Project configuration → Build & deploy → **Build hooks** → create one, then add its URL as `DEPLOY_HOOK_URL`. This is what makes phone edits go live.
4. **Load the starter content** (products, posts, settings, post ideas and RJ's growth plan): `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs`
5. **Weekly posts and Sunday coaching.** GitHub → Settings → Secrets → Actions: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEPLOY_HOOK_URL`, and optionally `RESEND_API_KEY`, `ORDER_NOTIFY_EMAIL`, `ORDER_FROM_EMAIL`. Run "VolksVision auto-blog" and "VolksVision weekly coach" once by hand to confirm.
6. **Google.** Add the domain to Search Console and submit `/sitemap.xml`. Create a Google Business Profile for VolksVision (St. Petersburg) linking to the site.

## Local preview

```bash
node build.mjs && npx wrangler pages dev public   # site + API (needs the env vars above in .dev.vars)
npm install && npm run post:dry                   # print a sample post without saving it
```
Without Supabase variables the build uses `catalog.js` and `content/posts/` as starter content.
