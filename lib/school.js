// School First: RJ's semester plan, weekly check-ins and the Studio lock.
// The rule Cara set: school comes before the business. While RJ is behind on school,
// the Studio is School-only for him (shipping existing orders still works so buyers are never hurt).
//
// Week cycle (Eastern time): each week starts Monday. RJ lists what's due that week, keeps it
// updated, and submits the week's check-in (statuses, current grades, proof screenshots, reflection)
// by Sunday 8:00 p.m. Cara approves it or sends it back.
//
// RJ is locked when any of these is true:
//   - the agreement isn't accepted, or there are no classes, or the semester plan was never approved
//   - the most recent check-in that's past its deadline is missing, still a draft, or was sent back
//   - Cara turned on a manual hold
//   - Cara turned on "lock below the grade floor" and a class is below it
import { supa } from "./content.js";

export const TZ = "America/New_York";
export const DEADLINE_HOUR = 20;   // Sunday 8 p.m. Eastern

export const SCHOOL_DEFAULTS = {
  term: "", termEnd: "", startedOn: "",
  gpaStart: 3.54, gpaNow: 3.3, gpaGoal: 3.54,
  classes: [],                        // [{id, name, teacher, portal, grade, target}]
  plan: { text: "", files: [], status: "draft", note: "", submittedAt: null, approvedAt: null, changedSinceApproval: false },
  agreement: { acceptedAt: null },
  message: "",                        // Cara's own words, shown to RJ every day
  hold: { on: false, note: "" },
  gradeFloor: "C", lockBelowFloor: false
};

// ---------- dates (Eastern) ----------
export function etNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
export const addDays = (iso, n) => { const x = new Date(iso + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const mondayOf = iso => { const x = new Date(iso + "T12:00:00Z"); return addDays(iso, -((x.getUTCDay() + 6) % 7)); };
export const deadlineOf = weekOf => addDays(weekOf, 6);   // the Sunday; due at DEADLINE_HOUR Eastern
const pastDeadline = (weekOf, now) => now.date > deadlineOf(weekOf) || (now.date === deadlineOf(weekOf) && now.hour >= DEADLINE_HOUR);
// The most recent week whose deadline has passed.
export function dueWeek(now = etNow()) {
  const cur = mondayOf(now.date);
  return pastDeadline(cur, now) ? cur : addDays(cur, -7);
}

// ---------- grades ----------
const LETTERS = ["F", "D", "C", "B", "A"];
// "B+", "87", "87%", "B 87%" -> 0 (F) .. 4 (A). Returns null when it can't tell.
export function gradeRank(g) {
  const s = String(g || "").trim().toUpperCase();
  const letter = s.match(/^[ABCDF]/);
  if (letter) return LETTERS.indexOf(letter[0]);
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return n >= 90 ? 4 : n >= 80 ? 3 : n >= 70 ? 2 : n >= 60 ? 1 : 0;
}
export const belowFloor = (grade, floor) => { const r = gradeRank(grade), f = gradeRank(floor); return r !== null && f !== null && r < f; };

// ---------- data ----------
export async function getSchool(env) {
  const [row] = await supa(env, "vv_school?id=eq.1&select=data");
  const d = row?.data || {};
  return { ...SCHOOL_DEFAULTS, ...d,
    plan: { ...SCHOOL_DEFAULTS.plan, ...(d.plan || {}) },
    agreement: { ...SCHOOL_DEFAULTS.agreement, ...(d.agreement || {}) },
    hold: { ...SCHOOL_DEFAULTS.hold, ...(d.hold || {}) },
    classes: Array.isArray(d.classes) ? d.classes : [] };
}
export const saveSchool = (env, data) =>
  supa(env, "vv_school?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: 1, data, updated_at: new Date().toISOString() }) });
export const getWeeks = (env, limit = 16) => supa(env, `vv_school_weeks?select=*&order=week_of.desc&limit=${limit}`);
export async function getWeek(env, weekOf) { const [w] = await supa(env, `vv_school_weeks?week_of=eq.${weekOf}&select=*`); return w || null; }

// ---------- the lock ----------
// Pure: decides from data already loaded. Returns {locked, reasons[], dueWeek, deadline, atRisk[]}.
export function evaluate(school, weeks, now = etNow()) {
  const reasons = [];
  if (!school.agreement.acceptedAt) reasons.push("Read and accept the School First agreement (School → Plan).");
  if (!school.classes.length) reasons.push("Add your classes this term (School → Plan).");
  if (!school.plan.approvedAt) reasons.push(school.plan.status === "submitted" ? "Your semester plan is waiting for Cara's approval." : "Submit your semester plan for Cara's approval (School → Plan).");
  if (school.hold.on) reasons.push(`Cara put a hold on the Studio${school.hold.note ? `: ${school.hold.note}` : "."}`);

  const due = dueWeek(now);
  const first = school.startedOn ? mondayOf(school.startedOn) : null;
  if (first && due >= first) {
    const w = weeks.find(x => x.week_of === due);
    const label = new Date(due + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    if (!w || w.status === "draft") reasons.push(`The check-in for the week of ${label} wasn't submitted. Submit it now.`);
    else if (w.status === "returned") reasons.push(`Cara sent back the week of ${label}${w.review_note ? `: "${w.review_note}"` : ""}. Fix it and resubmit.`);
  }

  const atRisk = school.classes.filter(c => belowFloor(c.grade, school.gradeFloor));
  if (school.lockBelowFloor && atRisk.length)
    reasons.push(`${atRisk.map(c => c.name).join(", ")} ${atRisk.length > 1 ? "are" : "is"} below ${school.gradeFloor}. Bring ${atRisk.length > 1 ? "them" : "it"} up with Cara's OK.`);

  const cur = mondayOf(now.date);
  return { locked: reasons.length > 0, reasons, dueWeek: due, currentWeek: cur, deadline: deadlineOf(cur), atRisk: atRisk.map(c => c.name) };
}

export async function schoolGate(env) {
  const [school, weeks] = await Promise.all([getSchool(env), getWeeks(env, 4)]);
  return evaluate(school, weeks);
}

// Lines that show in the Studio and on reminders. Cara's own message always comes first.
export const FUTURE_LINES = [
  "The Mk2 gets built one bolt at a time. So does a 3.5.",
  "School is the engine. VolksVision is the body kit. Engine first.",
  "Every brand that pays you later will ask what you finished. Finish this.",
  "Ten minutes on the assignment now beats an hour of stress on Sunday.",
  "A degree can't be repossessed.",
  "You fixed a rusted Jetta. You can fix one class.",
  "Grades are the one stat nobody can buy. Earn it.",
  "Future RJ is counting on today's RJ. Don't leave him stranded on the shoulder.",
  "Creators come and go. The ones with a plan B stay in the game.",
  "Show up for school like you show up for a meet: early and ready."
];
export const futureLine = (school, seed = Date.now()) => {
  const day = Math.floor(seed / 864e5);
  return school.message && day % 2 === 0 ? school.message : FUTURE_LINES[day % FUTURE_LINES.length];
};
