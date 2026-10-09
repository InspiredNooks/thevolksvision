// /api/admin/money - sponsorship deals and income (Studio → Money).
// GET                          {deals, income}
// POST {kind:"deal"|"income", ...}   create or update (id)
// DELETE ?kind=deal|income&id=
import { db, json, adminRoute, str, UserError } from "../../../lib/server.js";

const STATUSES = ["pitched", "negotiating", "signed", "delivered", "paid", "lost"];
const SOURCES = ["creator", "affiliate", "sponsor", "merch", "other"];
const amt = (v, label) => { const n = Math.round(Number(String(v ?? "").replace(/[$,\s]/g, "")) * 100) / 100; if (!(n >= 0 && n < 1e7)) throw new UserError(`${label} must be a dollar amount.`); return n; };
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null;

function cleanDeal(b) {
  const brand = str(b.brand, 120);
  if (!brand) throw new UserError("Add the brand name.");
  const status = STATUSES.includes(b.status) ? b.status : "pitched";
  return { brand, contact: str(b.contact, 120) || null, email: str(b.email, 160) || null, status, value: amt(b.value || 0, "Deal value"),
    product: str(b.product, 200) || null, deliverables: str(b.deliverables, 2000), due_on: day(b.due_on),
    paid_on: status === "paid" ? (day(b.paid_on) || new Date().toISOString().slice(0, 10)) : null,
    notes: str(b.notes, 4000), inquiry_id: Number.isInteger(b.inquiry_id) ? b.inquiry_id : null, updated_at: new Date().toISOString() };
}
function cleanIncome(b) {
  if (!SOURCES.includes(b.source)) throw new UserError("Pick where the money came from.");
  return { received_on: day(b.received_on) || new Date().toISOString().slice(0, 10), source: b.source, platform: str(b.platform, 40) || null,
    amount: amt(b.amount, "Amount"), note: str(b.note, 300) };
}

export const onRequestGet = adminRoute(async ({ env }) => {
  const [deals, income] = await Promise.all([
    db(env, "vv_deals?select=*&order=updated_at.desc&limit=500"),
    db(env, `vv_income?select=*&received_on=gte.${new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10)}&order=received_on.desc`)
  ]);
  return json({ deals, income });
});

export const onRequestPost = adminRoute(async ({ request, env }) => {
  const b = await request.json();
  const table = b.kind === "deal" ? "vv_deals" : b.kind === "income" ? "vv_income" : null;
  if (!table) throw new UserError("Unknown item.");
  const row = b.kind === "deal" ? cleanDeal(b) : cleanIncome(b);
  if (b.id) {
    const [saved] = await db(env, `${table}?id=eq.${Number(b.id)}`, { method: "PATCH", body: JSON.stringify(row) });
    if (!saved) throw new UserError("That item no longer exists.");
    return json(saved);
  }
  const [saved] = await db(env, table, { method: "POST", body: JSON.stringify(row) });
  if (b.kind === "deal" && row.inquiry_id) await db(env, `vv_inquiries?id=eq.${row.inquiry_id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "replied" }) });
  return json(saved);
});

export const onRequestDelete = adminRoute(async ({ request, env }) => {
  const u = new URL(request.url), id = Number(u.searchParams.get("id")), kind = u.searchParams.get("kind");
  if (!id || !["deal", "income"].includes(kind)) throw new UserError("Missing item.");
  await db(env, `${kind === "deal" ? "vv_deals" : "vv_income"}?id=eq.${id}`, { method: "DELETE" });
  return json({ deleted: id });
});
