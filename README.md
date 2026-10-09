# VolksVision

RJ's site: his Mk2 Jetta build, merch shop, weekly Journal and fan list, with a phone app ("Studio") to run all of it.
Same stack as Tampa Bay Home Maintenance: **Cloudflare Pages + Supabase + Resend**, plus the Claude API for weekly posts.

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

1. **Domains.** `thevolksvision.com` is the main address; `thevolksvision.shop` redirects to it. Point both at Cloudflare (change the nameservers at DreamHost to the ones Cloudflare gives you), then add **both** as custom domains on the Pages project, plus `www.thevolksvision.com`. `functions/_middleware.js` sends .shop and www to the .com with a permanent redirect, so Google sees one site.
2. **Supabase.** New project → SQL Editor → run `supabase/schema.sql`. Copy the project URL and the **service role** key.
3. **Cloudflare Pages.** Create a project from this repo:
   - Netlify reads netlify.toml at the repo root (build command and publish directory are set there).
   - Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN` (RJ's passphrase, long), `ANTHROPIC_API_KEY` (coach and captions), `RESEND_API_KEY`, `ORDER_NOTIFY_EMAIL` (`thevolksvision@gmail.com`, the default), `ORDER_FROM_EMAIL` (`VolksVision <orders@thevolksvision.shop>`; verify thevolksvision.shop in Resend), `INDEXNOW_KEY` (any random 32-character string), `LIST_SECRET` (random string for unsubscribe links), optional `YOUTUBE_API_KEY` (YouTube Data API v3).
   - Settings → Builds → **Deploy hooks** → create one, then add its URL as `DEPLOY_HOOK_URL`. This is what makes phone edits go live.
4. **Load the starter content** (products, posts, settings, post ideas and RJ's growth plan): `cd volksvision && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs`
5. **Weekly posts and Sunday coaching.** GitHub → Settings → Secrets → Actions: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEPLOY_HOOK_URL`, and optionally `RESEND_API_KEY`, `ORDER_NOTIFY_EMAIL`, `ORDER_FROM_EMAIL`. Run "VolksVision auto-blog" and "VolksVision weekly coach" once by hand to confirm.
6. **Google.** Add the domain to Search Console and submit `/sitemap.xml`. Create a Google Business Profile for VolksVision (St. Petersburg) linking to the site.

## Local preview

```bash
node build.mjs && npx wrangler pages dev public   # site + API (needs the env vars above in .dev.vars)
npm install && npm run post:dry                   # print a sample post without saving it
```
Without Supabase variables the build uses `catalog.js` and `content/posts/` as starter content.
