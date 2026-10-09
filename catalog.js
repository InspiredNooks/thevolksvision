// VolksVision store settings and product catalog.
// This one file feeds the homepage, the SEO data, and the order API,
// so prices shown on the site always match what the server charges.

export const CONFIG = {
  brand: "VolksVision",
  siteUrl: "https://thevolksvision.com",          // final domain, no trailing slash
  tagline: "VW culture through the lens",
  city: "St. Petersburg, FL",
  orderEmail: "shop@thevolksvision.com",            // shown to buyers; forwards to RJ's Gmail (set up in DreamHost Mail)
  payWith: "Venmo, Cash App, or Zelle",          // RJ confirms each order with a payment request
  instagram: "https://www.instagram.com/thevolksvision/",
  tiktok: "https://www.tiktok.com/@thevolksvision",
  shipping: 6,          // flat shipping, USD
  freeShipOver: 75
};

// stripe: optional Stripe Payment Link (https://buy.stripe.com/...). When set,
// the button sends the buyer straight to card checkout instead of the bag.
// image: optional path to a real product photo in /static/img (e.g. "/img/tee.jpg").
// Until then the site uses the line-drawing artwork named in `art`.
export const PRODUCTS = [
  { id: "volksvision-lens-logo-tee", cat: "wear", name: "VolksVision Lens Logo Tee", price: 28,
    sizes: ["S", "M", "L", "XL", "2XL"], tag: "Drop 01", art: "tee", exif: "1/250 · f/8",
    blurb: "Heavyweight cotton, aperture mark on the chest, frame data down the spine.", stripe: "", image: "" },
  { id: "mk2-box-body-hoodie", cat: "wear", name: "Mk2 Box Body Hoodie", price: 55,
    sizes: ["S", "M", "L", "XL", "2XL"], tag: "Limited", art: "hoodie", exif: "1/125 · f/5.6",
    blurb: "Midweight fleece with the Mk2 Jetta's three-box profile across the back. Square car, warm hoodie.", stripe: "", image: "" },
  { id: "volksvision-lens-cap", cat: "wear", name: "VolksVision Lens Cap", price: 30,
    sizes: ["One size"], art: "cap", exif: "1/500 · f/11",
    blurb: "Unstructured six-panel with the lens mark embroidered up front.", stripe: "", image: "" },
  { id: "vw-toolbox-sticker-pack", cat: "garage", name: "VW Toolbox Sticker Pack", price: 10,
    sizes: ["5-pack"], art: "sticker", exif: "1/60 · f/4",
    blurb: "Five weatherproof vinyl die-cuts for toolboxes, windows and laptops.", stripe: "", image: "" },
  { id: "frame-00-key-tag", cat: "garage", name: "Frame 00 Key Tag", price: 14,
    sizes: ["One size"], art: "key", exif: "1/1000 · f/16",
    blurb: "Woven key tag in sea-foam and amber. Survives the ignition, the beach and the shop floor.", stripe: "", image: "" },
  { id: "mk2-jetta-golden-hour-print", cat: "prints", name: "Mk2 Jetta Golden Hour Print", price: 35,
    sizes: ['8x10"', '11x14"', '16x20"'], tag: "Signed", art: "print", exif: "1/320 · f/2.8",
    blurb: "Archival print of RJ's Mk2 at sundown. Signed and numbered by RJ.", stripe: "", image: "" }
];

export const ORDER_STATUSES = ["new", "awaiting_payment", "paid", "shipped", "delivered", "cancelled"];
