// School First reminders (GitHub Actions: .github/workflows/school.yml).
// Morning:   what's due today, and the lock status if RJ is locked. Cara hears about a missed
//            check-in, and about anything waiting for her review.
// Afternoon: what's due tomorrow that isn't done, and a nudge if this week's list is still empty.
// Sunday:    the check-in is due at 8 p.m.
// Every message to RJ carries a "this is your future" line (Cara's own message on alternate days).
import { hasDb } from "../lib/content.js";
import { sendPush } from "../lib/push.js";
import { sendEmail } from "../lib/server.js";
import { getSchool, getWeeks, evaluate, etNow, mondayOf, addDays, futureLine } from "../lib/school.js";

const env = process.env;
if (!hasDb(env)) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
const dryRun = process.argv.includes("--dry-run");

const school = await getSchool(env);
const weeks = await getWeeks(env, 6);
// SCHOOL_NOW (an ISO time) is for testing only.
const now = etNow(env.SCHOOL_NOW ? new Date(env.SCHOOL_NOW) : undefined), gate = evaluate(school, weeks, now), line = futureLine(school);
const slot = now.hour < 11 ? "morning" : now.hour < 17 ? "afternoon" : "evening";
const cur = mondayOf(now.date), week = weeks.find(w => w.week_of === cur);
const cls = id => school.classes.find(c => c.id === id)?.name || "";
const open = (week?.assignments || []).filter(a => ["todo", "late"].includes(a.status));
const list = xs => xs.slice(0, 4).map(a => `${cls(a.cls) ? cls(a.cls) + ": " : ""}${a.title}`).join(" · ") + (xs.length > 4 ? ` +${xs.length - 4} more` : "");

const toRJ = [], toCara = [];
if (gate.locked) toRJ.push({ title: "🔒 Studio is School-only right now", body: `${gate.reasons[0]} ${line}`, tag: "school-lock" });

if (slot === "morning") {
  const today = open.filter(a => a.due === now.date);
  if (today.length) toRJ.push({ title: `📚 Due today (${today.length})`, body: `${list(today)}. ${line}`, tag: "school-today" });
  else if (!gate.locked) toRJ.push({ title: "📚 School first", body: line, tag: "school-line" });

  // Cara: a check-in that was due and missed (once, on Monday), and anything waiting on her.
  const due = weeks.find(w => w.week_of === gate.dueWeek);
  if (now.wd === 1 && school.startedOn && gate.dueWeek >= mondayOf(school.startedOn) && (!due || ["draft", "returned"].includes(due.status)))
    toCara.push({ title: "RJ missed his weekly school check-in", body: "The Studio is locked for him until he submits it.", tag: "school-missed", email: true });
  const waiting = weeks.filter(w => w.status === "submitted").length + (school.plan.status === "submitted" ? 1 : 0);
  if (waiting) toCara.push({ title: `${waiting} school item${waiting > 1 ? "s" : ""} waiting for your review`, body: "Open School in the Studio to approve or send back.", tag: "school-review" });
}

if (slot === "afternoon") {
  const tomorrow = open.filter(a => a.due === addDays(now.date, 1));
  if (tomorrow.length) toRJ.push({ title: `⏰ Due tomorrow (${tomorrow.length})`, body: `${list(tomorrow)}. Knock it out tonight. ${line}`, tag: "school-tomorrow" });
  const late = open.filter(a => a.due && a.due < now.date);
  if (late.length) toRJ.push({ title: `⚠️ ${late.length} past due`, body: `${list(late)}. Email the teacher today and turn in what you can.`, tag: "school-late" });
  if (now.wd >= 2 && now.wd <= 4 && !(week?.assignments || []).length) toRJ.push({ title: "📋 What's due this week?", body: "List this week's assignments in School so the reminders can help you.", tag: "school-list" });
}

if (now.wd === 0 && slot !== "morning" && (!week || ["draft", "returned"].includes(week.status)))
  toRJ.push({ title: now.hour >= 17 ? "⏳ Check-in due at 8 PM" : "📝 Weekly check-in due tonight at 8", body: `Grades, proof screenshot, what got done. Miss it and the Studio locks. ${line}`, tag: "school-checkin" });

const url = "/admin#school";
for (const m of toRJ) dryRun ? console.log("RJ:", m) : await sendPush(env, "admin", { ...m, url }, "rj").catch(e => console.error(e));
for (const m of toCara) {
  if (dryRun) { console.log("Cara:", m); continue; }
  await sendPush(env, "admin", { title: m.title, body: m.body, tag: m.tag, url }, "cara").catch(e => console.error(e));
  if (m.email && env.SCHOOL_PARENT_EMAIL) await sendEmail(env, { to: env.SCHOOL_PARENT_EMAIL, subject: m.title, text: `${m.body}\n\nOpen the Studio: ${(env.SITE_URL || "https://thevolksvision.com").replace(/\/$/, "")}/admin#school` }).catch(e => console.error(e));
}
console.log(`School reminders (${slot}, ${now.date}): ${toRJ.length} to RJ, ${toCara.length} to Cara. Locked: ${gate.locked}.`);
