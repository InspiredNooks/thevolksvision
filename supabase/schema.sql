-- VolksVision order CRM. Run once in Supabase > SQL Editor.
-- Row Level Security is on with no policies, so the public/publishable key
-- can't read or write orders. Only the server (service role key) can.

create table if not exists public.vv_orders (
  id               bigint generated always as identity primary key,
  order_number     text not null unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  status           text not null default 'new'
                   check (status in ('new','awaiting_payment','paid','shipped','delivered','cancelled')),
  customer_name    text not null,
  customer_contact text not null,
  customer_email   text,
  ship_to          text not null,
  items            jsonb not null,
  subtotal         numeric(10,2) not null,
  shipping         numeric(10,2) not null default 0,
  total            numeric(10,2) not null,
  tracking         text,
  notes            text
);

create index if not exists vv_orders_status_idx  on public.vv_orders (status);
create index if not exists vv_orders_created_idx on public.vv_orders (created_at desc);

alter table public.vv_orders enable row level security;

-- ---------------------------------------------------------------
-- Content RJ edits from his phone (/admin). Same rule: RLS on, no
-- public policies; only the server's service role key can touch it.
-- ---------------------------------------------------------------

create table if not exists public.vv_products (
  id          text primary key,                 -- URL slug: /shop/<id>/
  name        text not null,
  cat         text not null default 'wear',
  price       numeric(10,2) not null check (price >= 0),
  sizes       jsonb not null default '["One size"]',
  tag         text,
  blurb       text not null default '',
  details     text not null default '',         -- longer Markdown description for the product page
  exif        text,
  art         text not null default 'tee',      -- fallback drawing when there's no photo
  image       text,                             -- public photo URL
  image_alt   text,
  stripe      text,
  active      boolean not null default true,
  sold_out    boolean not null default false,       -- stays visible as proof of demand
  archived    boolean not null default false,       -- pulled from the shop but kept to bring back later
  sort        int not null default 100,
  updated_at  timestamptz not null default now()
);

create table if not exists public.vv_posts (
  id          bigint generated always as identity primary key,
  slug        text not null unique,             -- URL: /journal/<slug>/ (kept stable for SEO)
  title       text not null,
  description text not null default '',
  body        text not null default '',         -- Markdown
  tags        text not null default '',
  image       text,
  image_alt   text,
  status      text not null default 'published' check (status in ('draft','published')),
  date        date not null default current_date,
  source      text not null default 'rj' check (source in ('rj','auto')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists vv_posts_status_date_idx on public.vv_posts (status, date desc);

create table if not exists public.vv_settings (
  id    int primary key default 1 check (id = 1),
  data  jsonb not null default '{}'
);
insert into public.vv_settings (id, data) values (1, '{}') on conflict do nothing;

alter table public.vv_products add column if not exists archived boolean not null default false;
alter table public.vv_products add column if not exists images jsonb not null default '[]';   -- extra photos [{url, alt}] after the main one
alter table public.vv_products enable row level security;
alter table public.vv_posts    enable row level security;
alter table public.vv_settings enable row level security;

-- Public bucket for product and post photos (readable by anyone, writable only by the server).
insert into storage.buckets (id, name, public) values ('vv-media', 'vv-media', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Audience: drop-alert signups and brand / collab inquiries.
-- ---------------------------------------------------------------
create table if not exists public.vv_subscribers (
  id          bigint generated always as identity primary key,
  email       text not null unique,
  source      text,
  created_at  timestamptz not null default now()
);

create table if not exists public.vv_inquiries (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text not null,
  company     text,
  kind        text,
  message     text not null,
  status      text not null default 'new' check (status in ('new','replied','closed')),
  created_at  timestamptz not null default now()
);

alter table public.vv_subscribers enable row level security;
alter table public.vv_inquiries   enable row level security;

-- ---------------------------------------------------------------
-- Grow: RJ's private influencer growth plan (Studio → Grow).
-- kind: section (playbook text), task (90-day checklist),
--       idea (video idea bank), metric (weekly numbers log)
-- ---------------------------------------------------------------
create table if not exists public.vv_plan (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('section','task','idea','metric')),
  title       text not null default '',
  body        text not null default '',
  data        jsonb not null default '{}',
  done        boolean not null default false,
  sort        int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists vv_plan_kind_idx on public.vv_plan (kind, sort);
alter table public.vv_plan enable row level security;

-- ---------------------------------------------------------------
-- Socials: one row per video RJ posts (logged on his phone, or
-- synced automatically for YouTube). Feeds Studio → Grow → Stats.
-- ---------------------------------------------------------------
create table if not exists public.vv_videos (
  id          bigint generated always as identity primary key,
  platform    text not null check (platform in ('TikTok','Instagram','YouTube','Facebook')),
  url         text,
  external_id text,                                  -- YouTube video id for auto-sync
  title       text not null default '',
  posted_on   date not null default current_date,
  pillar      text,
  hook        text,
  length_sec  int,
  views       int not null default 0,
  likes       int not null default 0,
  comments    int not null default 0,
  shares      int not null default 0,
  saves       int not null default 0,
  follows     int not null default 0,                -- new followers from this video (from the app's analytics)
  notes       text not null default '',
  updated_at  timestamptz not null default now(),
  unique (platform, external_id)
);
create index if not exists vv_videos_posted_idx on public.vv_videos (posted_on desc);

-- Weekly AI coach reports (Studio → Grow → Stats).
create table if not exists public.vv_coach (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  report      jsonb not null
);

-- Crew: followers submit their cars; RJ approves and features them on /crew/.
create table if not exists public.vv_crew (
  id          bigint generated always as identity primary key,
  name        text not null,
  handle      text,
  email       text,
  car         text not null,
  story       text not null default '',
  photo       text,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  featured    boolean not null default false,        -- "Crew car of the week" on the homepage
  created_at  timestamptz not null default now()
);
create index if not exists vv_crew_status_idx on public.vv_crew (status, created_at desc);

alter table public.vv_videos enable row level security;
alter table public.vv_coach  enable row level security;
alter table public.vv_crew   enable row level security;

-- Pit Crew lists: which emails each fan wants ('drops', 'glovebox').
alter table public.vv_subscribers add column if not exists lists text[] not null default '{drops,glovebox}';
alter table public.vv_subscribers add column if not exists unsubscribed boolean not null default false;

-- ---------------------------------------------------------------
-- Money: sponsorship deals and other income (Studio → Money).
-- ---------------------------------------------------------------
create table if not exists public.vv_deals (
  id           bigint generated always as identity primary key,
  brand        text not null,
  contact      text,
  email        text,
  status       text not null default 'pitched' check (status in ('pitched','negotiating','signed','delivered','paid','lost')),
  value        numeric(10,2) not null default 0,       -- cash value of the deal
  product      text,                                   -- gifted product, if any
  deliverables text not null default '',
  due_on       date,
  paid_on      date,
  notes        text not null default '',
  inquiry_id   bigint,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.vv_income (
  id          bigint generated always as identity primary key,
  received_on date not null default current_date,
  source      text not null check (source in ('creator','affiliate','sponsor','merch','other')),
  platform    text,
  amount      numeric(10,2) not null check (amount >= 0),
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists vv_income_date_idx on public.vv_income (received_on desc);

alter table public.vv_deals  enable row level security;
alter table public.vv_income enable row level security;

-- ---------------------------------------------------------------
-- Where is VolksVision next? Meets, shows, shoots, drops.
-- ---------------------------------------------------------------
create table if not exists public.vv_events (
  id          bigint generated always as identity primary key,
  title       text not null,
  kind        text not null default 'meet' check (kind in ('meet','show','shoot','drop','reveal','other')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  venue       text,
  address     text,
  city        text not null default 'St. Petersburg, FL',
  link        text,
  details     text not null default '',
  published   boolean not null default true,
  pullups     int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists vv_events_start_idx on public.vv_events (starts_at);

create table if not exists public.vv_pullups (
  id          bigint generated always as identity primary key,
  event_id    bigint not null references public.vv_events(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

-- Atomic "Pull up" counter (called by the server only).
create or replace function public.vv_pullup(eid bigint) returns int language sql set search_path = '' as $$
  update public.vv_events set pullups = pullups + 1 where id = eid and published returning pullups;
$$;
revoke all on function public.vv_pullup(bigint) from public, anon, authenticated;

alter table public.vv_events  enable row level security;
alter table public.vv_pullups enable row level security;

-- Access: only the server (service_role key, kept in Netlify) reads or writes these tables.
-- Explicit grants so this works whether or not the project auto-exposes new tables to the Data API.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.vv_pullup(bigint) to service_role;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Push notifications: phones that turned on alerts (RJ's Studio = admin, fans = fan).
create table if not exists public.vv_push (
  id          bigint generated always as identity primary key,
  endpoint    text not null unique,
  keys        jsonb not null,
  role        text not null default 'fan' check (role in ('admin','fan')),
  created_at  timestamptz not null default now()
);
create index if not exists vv_push_role_idx on public.vv_push (role);
-- Server-only secrets the site generates for itself (the push signing keys).
create table if not exists public.vv_secrets (
  key   text primary key,
  value text not null
);
alter table public.vv_push enable row level security;
alter table public.vv_secrets enable row level security;
grant all on public.vv_push, public.vv_secrets to service_role;
grant all on all sequences in schema public to service_role;
revoke all on public.vv_push, public.vv_secrets from anon, authenticated;

-- Map pins + the event scout (migration: events_map_scout).
-- origin: rj (added by RJ), scout (found on the web), post (pulled from a social post/screenshot)
-- review: 'pending' = waiting for RJ to approve, 'skipped' = RJ passed (kept so it isn't suggested again)
-- rj_going: false = listed for the community, RJ isn't confirmed
alter table public.vv_events
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists origin text not null default 'rj',
  add column if not exists source_url text,
  add column if not exists review text,
  add column if not exists rj_going boolean not null default true,
  add column if not exists scout_key text;
alter table public.vv_events drop constraint if exists vv_events_origin_chk;
alter table public.vv_events add constraint vv_events_origin_chk check (origin in ('rj','scout','post'));
alter table public.vv_events drop constraint if exists vv_events_review_chk;
alter table public.vv_events add constraint vv_events_review_chk check (review is null or review in ('pending','skipped'));
create unique index if not exists vv_events_scout_key_idx on public.vv_events (scout_key);

-- Stripe checkout bookkeeping (already applied: orders_stripe)
alter table public.vv_orders add column if not exists stripe_session text, add column if not exists paid_at timestamptz;
-- "I'm going" counts once per visitor per stop (migration: pullups_dedupe). who = one-way hash, never a raw IP.
alter table public.vv_pullups add column if not exists who text;
create unique index if not exists vv_pullups_event_who_idx on public.vv_pullups (event_id, who);
